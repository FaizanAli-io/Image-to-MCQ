import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';
import { atomicJSON, jobRoot, jobPath, listJobIds, readJob } from '../lib/mini-quiz-jobs';
import { cleanupJobSources, runMiniQuizJob } from '../lib/mini-quiz-job-runner';

async function main() {
  // OS-owned singleton lock: released automatically on crashes, unlike PID files.
  const lock = createServer(socket => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    lock.once('error', reject);
    lock.listen(Number(process.env.MINI_QUIZ_WORKER_LOCK_PORT || 48731), '127.0.0.1', resolve);
  });
  await fs.mkdir(jobRoot(), { recursive: true, mode: 0o700 });
  const beat = () => atomicJSON(path.join(jobRoot(), 'heartbeat.json'), { at: Date.now() });
  await beat();
  const heartbeat = setInterval(() => { void beat().catch(error => { console.error('Worker heartbeat failed', error.code); process.exit(1); }); }, 5_000);
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopping = true; });
  console.info('Mini quiz worker ready');
  try {
    while (!stopping) {
      const jobs = (await Promise.all((await listJobIds()).map(readJob))).filter(j => j !== undefined).sort((a, b) => a.createdAt - b.createdAt);
      for (const job of jobs) {
        if (stopping) break;
        if (job.expiresAt < Date.now()) {
          if (await cleanupJobSources(job)) await fs.rm(jobPath(job.id), { recursive: true, force: true });
        } else if (job.status === 'queued' || job.status === 'running') {
          // Running jobs belong to a previous, now-dead worker. Reuse checkpoints.
          await runMiniQuizJob(job);
        }
      }
      // Remove incomplete uploads left by a web-process crash after 24 hours.
      for (const name of await fs.readdir(jobRoot())) if (/^[a-f0-9]{64}\.upload$/.test(name)) {
        const folder = path.join(jobRoot(), name);
        if (Date.now() - (await fs.stat(folder)).mtimeMs > 86_400_000) await fs.rm(folder, { recursive: true, force: true });
      }
      if (!stopping) await new Promise(resolve => setTimeout(resolve, 2_000));
    }
  } finally {
    clearInterval(heartbeat);
    await fs.rm(path.join(jobRoot(), 'heartbeat.json'), { force: true });
    lock.close();
  }
}
void main().catch(error => { console.error('Mini quiz worker stopped', error); process.exit(1); });
