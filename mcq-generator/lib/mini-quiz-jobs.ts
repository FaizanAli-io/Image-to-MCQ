// EC2-only durable queue. Web and worker must share this private persistent path.
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { MiniQuizLevel } from './mini-quiz-config';
import type { MiniSection, MiniSectionDraft } from './mini-quiz-recovery';
import type { GeneratedQuestion } from './types';

const ID = /^[a-f0-9]{64}$/;
const TTL = 24 * 60 * 60 * 1000;
export interface MiniQuizJob {
  id: string;
  level: MiniQuizLevel;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  createdAt: number;
  expiresAt: number;
  sources: { name: string; type: string }[];
  attempts: Partial<Record<MiniSection, number>>;
  completed: MiniSection[];
  questions?: GeneratedQuestion[];
  error?: string;
  code?: string;
}
export function jobRoot() { return path.resolve(process.env.MINI_QUIZ_JOB_DIR || '.mini-quiz-jobs'); }
export function jobPath(id: string) {
  if (!ID.test(id)) throw new Error('Invalid job ID');
  return path.join(jobRoot(), id);
}
export async function atomicJSON(file: string, value: unknown) {
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
  try { await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}
export async function workerAvailable() {
  try {
    const heartbeat = JSON.parse(await fs.readFile(path.join(jobRoot(), 'heartbeat.json'), 'utf8'));
    return Date.now() - heartbeat.at < 30_000;
  } catch { return false; }
}
export async function listJobIds() {
  await fs.mkdir(jobRoot(), { recursive: true, mode: 0o700 });
  return (await fs.readdir(jobRoot())).filter(id => ID.test(id));
}
export async function readJob(id: string): Promise<MiniQuizJob | undefined> {
  if (!ID.test(id)) return undefined;
  try { return JSON.parse(await fs.readFile(path.join(jobPath(id), 'job.json'), 'utf8')); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; }
}
export async function saveJob(job: MiniQuizJob) { await atomicJSON(path.join(jobPath(job.id), 'job.json'), job); }
export async function createJob(files: File[], level: MiniQuizLevel) {
  const id = randomBytes(32).toString('hex');
  await fs.mkdir(jobRoot(), { recursive: true, mode: 0o700 });
  const staging = path.join(jobRoot(), `${id}.upload`);
  await fs.mkdir(staging, { mode: 0o700 });
  try {
    const sources = [];
    for (const [i, file] of files.entries()) {
      const name = `source-${i}`;
      await fs.writeFile(path.join(staging, name), Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
      sources.push({ name, type: file.type });
    }
    const job: MiniQuizJob = { id, level, status: 'queued', createdAt: Date.now(), expiresAt: Date.now() + TTL, sources, attempts: {}, completed: [] };
    await atomicJSON(path.join(staging, 'job.json'), job);
    await fs.rename(staging, jobPath(id));
    return job;
  } catch (error) { await fs.rm(staging, { recursive: true, force: true }); throw error; }
}
export async function saveSection(id: string, section: MiniSection, draft: MiniSectionDraft) {
  await atomicJSON(path.join(jobPath(id), `${section}.json`), draft);
}
export async function readSections(id: string) {
  const sections: Partial<Record<MiniSection, MiniSectionDraft>> = {};
  for (const section of ['ao1', 'ao2', 'ao3'] as const) {
    try { sections[section] = JSON.parse(await fs.readFile(path.join(jobPath(id), `${section}.json`), 'utf8')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  return sections;
}
export function publicJob(job: MiniQuizJob) {
  return { jobId: job.id, status: job.status, completedSections: job.completed.length,
    ...(job.status === 'succeeded' ? { success: true, questions: job.questions } : {}),
    ...(job.status === 'failed' ? { success: false, error: job.error, code: job.code } : {}) };
}
