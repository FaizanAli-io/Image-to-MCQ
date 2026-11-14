import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';
import { atomicJSON } from '../lib/mini-quiz-jobs';
import { MAPPER_EXTRACTION_VERSION } from '../lib/topic-mapper-contract';
import { expireMapperJobs, listMapperJobs, mapperJobRoot } from '../lib/mapper-jobs';
import { runMapperJob } from '../lib/mapper-job-runner';

async function main() {
  const lock = createServer(socket => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    lock.once('error', reject);
    lock.listen(Number(process.env.MAPPER_WORKER_LOCK_PORT || 48732), '127.0.0.1', resolve);
  });
  await fs.mkdir(mapperJobRoot(), { recursive: true, mode: 0o700 });
  const heartbeatFile = path.join(mapperJobRoot(), 'heartbeat.json');
  const beat = () => atomicJSON(heartbeatFile, { at: Date.now(), version: MAPPER_EXTRACTION_VERSION });
  await beat();
  const heartbeat = setInterval(() => { void beat().catch(error => { console.error('Mapper heartbeat failed', error.code); process.exit(1); }); }, 5000);
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopping = true; });
  console.info('Mapper worker ready');
  try {
    while (!stopping) {
      await expireMapperJobs();
      const jobs = (await listMapperJobs()).sort((a, b) => a.createdAt - b.createdAt);
      for (const job of jobs) {
        if (stopping) break;
        if (job.expiresAt > Date.now() && (job.status === 'queued' || job.status === 'running')) {
          console.info('Processing mapper job', job.id, job.kind);
          await runMapperJob(job);
        }
      }
      if (!stopping) await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } finally {
    clearInterval(heartbeat);
    await fs.rm(heartbeatFile, { force: true });
    lock.close();
  }
}
void main().catch(error => { console.error('Mapper worker stopped', error); process.exit(1); });
