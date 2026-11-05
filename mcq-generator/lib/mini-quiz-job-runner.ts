import * as fs from 'node:fs/promises';
import path from 'node:path';
import { generateMiniQuiz } from './openai';
import { uploadToR2, getSignedR2Url, deleteFromR2 } from './r2-client';
import { jobPath, saveJob, readSections, saveSection, type MiniQuizJob } from './mini-quiz-jobs';
import { MiniQuizEvidenceError } from './mini-quiz-errors';

export const sourceKey = (job: MiniQuizJob, i: number) => `temp/mini-jobs/${job.id}/source-${i}`;
export async function cleanupJobSources(job: MiniQuizJob) {
  const outcomes = await Promise.allSettled(job.sources.map(async (source, i) => {
    await deleteFromR2(sourceKey(job, i));
    await fs.rm(path.join(jobPath(job.id), source.name), { force: true });
  }));
  return outcomes.every(result => result.status === 'fulfilled');
}

export async function runMiniQuizJob(job: MiniQuizJob) {
  job.status = 'running';
  await saveJob(job);
  const started = Date.now();
  // Serialize job.json mutations from the three concurrent section callbacks.
  let writes = Promise.resolve();
  const update = (action: () => Promise<void>) => {
    writes = writes.then(action);
    return writes;
  };
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Worker API key is not configured');
    const completed = await readSections(job.id);
    const urls: string[] = [];
    // At most three uploads at once. Fixed keys let restart/cleanup find even
    // an upload completed just before the process died.
    if (Object.keys(completed).length < 3) {
      let next = 0;
      const uploads = await Promise.allSettled(Array.from({ length: Math.min(3, job.sources.length) }, async () => {
        while (next < job.sources.length) {
          const i = next++, source = job.sources[i];
          const buffer = await fs.readFile(path.join(jobPath(job.id), source.name));
          const key = await uploadToR2(buffer, source.name, source.type, sourceKey(job, i));
          urls[i] = await getSignedR2Url(key);
        }
      }));
      const failure = uploads.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    }
    console.info('Mini quiz job sources ready', { jobId: job.id, images: urls.length, durationMs: Date.now() - started });
    job.questions = await generateMiniQuiz(apiKey, urls, job.level, {
      deadlineMs: Date.now() + 250_000, completed, attempts: job.attempts,
      onAttempt: (section, attempt) => update(async () => { job.attempts[section] = attempt; await saveJob(job); }),
      onSection: (section, draft) => update(async () => {
        await saveSection(job.id, section, draft);
        if (!job.completed.includes(section)) job.completed.push(section);
        await saveJob(job);
      }),
    });
    job.status = 'succeeded';
  } catch (error) {
    // Log identifiers and error classes, never source images or signed URLs.
    console.error('Mini quiz job failed', { jobId: job.id, name: (error as Error)?.name, durationMs: Date.now() - started });
    job.status = 'failed';
    job.code = error instanceof MiniQuizEvidenceError ? 'INVALID_AO3_EVIDENCE' : 'QUIZ_GENERATION_FAILED';
    job.error = error instanceof MiniQuizEvidenceError ? error.message
      : 'The quiz could not be completed after automatic recovery. Please try again.';
  }
  // Results are persisted before best-effort cleanup; cleanup cannot hide success.
  await saveJob(job);
  await cleanupJobSources(job);
}
