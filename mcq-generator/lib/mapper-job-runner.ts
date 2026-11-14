import OpenAI from 'openai';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicJSON } from './mini-quiz-jobs';
import { cleanupMapperInput, mapperJobPath, saveMapperJob } from './mapper-jobs';
import { extractMapperDocuments } from './mapper-extraction-service';
import { mapQuestion, mappingStats, type QuestionMapping } from './mapper-mapping-service';
import type { MapperInput, MapperJob, MapperResult } from './mapper-job-types';

async function readOptional<T>(file: string): Promise<T | undefined> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

// Cache complete AI responses before continuing. A restarted worker reuses them
// with the original prompts rather than regenerating already completed sections.
export function checkpointedMapperClient(client: OpenAI, folder: string, deadline: number): OpenAI {
  const create = async (args: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, options?: { signal?: AbortSignal; timeout?: number; maxRetries?: number }) => {
    if (Date.now() >= deadline) throw new Error('Mapper processing time limit reached.');
    const key = createHash('sha256').update(JSON.stringify(args)).digest('hex');
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    const responseFile = path.join(folder, `${key}.json`);
    const cached = await readOptional<OpenAI.Chat.Completions.ChatCompletion>(responseFile);
    if (cached) return cached;
    const attemptsFile = path.join(folder, `${key}.attempts.json`);
    const attempts = await readOptional<number>(attemptsFile) || 0;
    if (attempts >= 2) throw new Error('A mapper request was interrupted repeatedly. Please retry this job.');
    await atomicJSON(attemptsFile, attempts + 1);
    const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
    const response = await client.chat.completions.create(args, { ...options, maxRetries: options?.maxRetries ?? 2,
      timeout: Math.min(options?.timeout || client.timeout || 600000, deadline - Date.now()),
      signal: options?.signal ? AbortSignal.any([signal, options.signal]) : signal,
    });
    await atomicJSON(responseFile, response);
    return response;
  };
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

export async function runMapperJob(job: MapperJob, client?: OpenAI) {
  const folder = mapperJobPath(job.id);
  try {
    // A result written just before a crash must not be regenerated.
    const existing = await readOptional<MapperResult>(path.join(folder, 'result.json'));
    if (existing) {
      job.status = 'succeeded';
      job.completed = existing.results?.length || existing.questions.length;
      job.total = job.completed;
      await saveMapperJob(job);
      return;
    }
    if (job.runs >= 2) throw new Error('The mapper worker restarted repeatedly during this job. Please try again.');
    job.runs++;
    job.status = 'running';
    await saveMapperJob(job);
    const input = JSON.parse(await fs.readFile(path.join(folder, 'input.json'), 'utf8')) as MapperInput;
    const deadline = Math.min(job.expiresAt, Date.now() + 30 * 60 * 1000);
    const openai = checkpointedMapperClient(client || new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), path.join(folder, 'requests'), deadline);
    let result: MapperResult;
    if (input.kind === 'extraction') {
      const [paper, marks] = await Promise.all([fs.readFile(path.join(folder, 'source-0.pdf')), fs.readFile(path.join(folder, 'source-1.pdf'))]);
      result = await extractMapperDocuments(openai, paper, marks);
      job.completed = result.questions.length;
      job.total = result.questions.length;
    } else {
      const results = await readOptional<QuestionMapping[]>(path.join(folder, 'mapping.json')) || [];
      const questions = input.questions!;
      if (results.length > questions.length || results.some((result, i) => result.question_id !== questions[i].question_id)) throw new Error('Invalid saved mapper progress.');
      for (let i = results.length; i < questions.length; i++) {
        if (Date.now() >= deadline) throw new Error('Mapper processing time limit reached.');
        try { results.push(await mapQuestion(openai, questions[i], input.topics!)); }
        catch (error) {
          // Preserve the existing mapper's per-question failure/review behavior.
          results.push({ question_id: questions[i].question_id, primary_topic: null, topic_name: '', secondary_topic: null,
            reason: `Mapping failed: ${error instanceof Error ? error.message : 'Unknown error'}`, needs_review: true, review_reason: 'mapping_error' });
        }
        await atomicJSON(path.join(folder, 'mapping.json'), results);
        job.completed = results.length;
        await saveMapperJob(job);
      }
      result = { success: true, questions, results, stats: mappingStats(results) };
    }
    await atomicJSON(path.join(folder, 'result.json'), result);
    job.status = 'succeeded';
    await saveMapperJob(job);
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Mapper processing failed.';
    await saveMapperJob(job);
  } finally {
    if (job.status === 'succeeded' || job.status === 'failed') await cleanupMapperInput(job.id);
  }
}
