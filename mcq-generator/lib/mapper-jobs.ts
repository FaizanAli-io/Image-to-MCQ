import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { atomicJSON } from './mini-quiz-jobs';
import { MAPPER_EXTRACTION_VERSION } from './topic-mapper-contract';
import type { MapperInput, MapperJob, MapperJobView, MapperResult } from './mapper-job-types';

const ID = /^[a-f0-9]{64}$/;
export const MAPPER_JOB_TTL = 24 * 60 * 60 * 1000;
export function mapperJobRoot() { return path.resolve(process.env.MAPPER_JOB_DIR || '.mapper-jobs'); }
export function mapperJobPath(id: string) {
  if (!ID.test(id)) throw new Error('Invalid mapper job ID');
  return path.join(mapperJobRoot(), id);
}
export async function mapperWorkerAvailable() {
  try {
    const beat = JSON.parse(await fs.readFile(path.join(mapperJobRoot(), 'heartbeat.json'), 'utf8'));
    return beat.version === MAPPER_EXTRACTION_VERSION && Date.now() - beat.at >= 0 && Date.now() - beat.at < 30000;
  } catch { return false; }
}
export async function readMapperJob(id: string): Promise<MapperJob | undefined> {
  if (!ID.test(id)) return undefined;
  try { return JSON.parse(await fs.readFile(path.join(mapperJobPath(id), 'job.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
export async function saveMapperJob(job: MapperJob) { await atomicJSON(path.join(mapperJobPath(job.id), 'job.json'), job); }
export async function listMapperJobs() {
  await fs.mkdir(mapperJobRoot(), { recursive: true, mode: 0o700 });
  const ids = (await fs.readdir(mapperJobRoot())).filter(id => ID.test(id));
  return (await Promise.all(ids.map(readMapperJob))).filter((job): job is MapperJob => Boolean(job));
}
export async function createMapperJob(input: MapperInput, files: File[] = [], requestedId?: string | null) {
  if (requestedId && !ID.test(requestedId)) throw new Error('Invalid mapper request ID');
  const id = requestedId || randomBytes(32).toString('hex');
  const existing = await readMapperJob(id);
  if (existing) {
    if (existing.kind !== input.kind || existing.expiresAt <= Date.now()) throw new Error('Mapper request ID cannot be reused for this request.');
    return existing;
  }
  await fs.mkdir(mapperJobRoot(), { recursive: true, mode: 0o700 });
  const staging = path.join(mapperJobRoot(), `${id}.upload`);
  await fs.mkdir(staging, { mode: 0o700 });
  try {
    for (const [index, file] of files.entries()) {
      await fs.writeFile(path.join(staging, `source-${index}.pdf`), Buffer.from(await file.arrayBuffer()), { mode: 0o600, flush: true });
    }
    await atomicJSON(path.join(staging, 'input.json'), input);
    const job: MapperJob = { id, kind: input.kind, status: 'queued', createdAt: Date.now(), expiresAt: Date.now() + MAPPER_JOB_TTL,
      runs: 0, completed: 0, total: input.kind === 'mapping' ? input.questions!.length : 0 };
    await atomicJSON(path.join(staging, 'job.json'), job);
    await fs.rename(staging, mapperJobPath(id));
    return job;
  } catch (error) { await fs.rm(staging, { recursive: true, force: true }); throw error; }
}
export async function mapperJobView(job: MapperJob): Promise<MapperJobView> {
  const view: MapperJobView = { jobId: job.id, kind: job.kind, status: job.status, completed: job.completed, total: job.total };
  if (job.status === 'succeeded') view.result = JSON.parse(await fs.readFile(path.join(mapperJobPath(job.id), 'result.json'), 'utf8')) as MapperResult;
  else if (job.status === 'failed') view.error = job.error;
  else view.workerAvailable = await mapperWorkerAvailable();
  return view;
}
export async function cleanupMapperInput(id: string) {
  const folder = mapperJobPath(id);
  for (const file of ['input.json', 'source-0.pdf', 'source-1.pdf', 'mapping.json']) await fs.rm(path.join(folder, file), { force: true });
  await fs.rm(path.join(folder, 'requests'), { recursive: true, force: true });
}
export async function expireMapperJobs() {
  for (const job of await listMapperJobs()) if (job.expiresAt <= Date.now()) await fs.rm(mapperJobPath(job.id), { recursive: true, force: true });
  for (const name of await fs.readdir(mapperJobRoot())) if (/^[a-f0-9]{64}\.upload$/.test(name)) {
    const folder = path.join(mapperJobRoot(), name);
    if (Date.now() - (await fs.stat(folder)).mtimeMs > MAPPER_JOB_TTL) await fs.rm(folder, { recursive: true, force: true });
  }
}
