const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadModule } = require('./load-module.cjs');
const jobs = loadModule('lib/mapper-jobs.ts');
const { MAPPER_EXTRACTION_VERSION } = loadModule('lib/topic-mapper-contract.ts');
const { atomicJSON } = loadModule('lib/mini-quiz-jobs.ts');

async function sandbox(fn) {
  const before = process.env.MAPPER_JOB_DIR;
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'mapper-jobs-test-'));
  process.env.MAPPER_JOB_DIR = folder;
  try { await fn(folder); }
  finally {
    if (before === undefined) delete process.env.MAPPER_JOB_DIR; else process.env.MAPPER_JOB_DIR = before;
    await fs.rm(folder, { recursive: true, force: true });
  }
}
const questions = [{ question_id: 'Q1', text: 'Original question', mark_scheme: 'Original answer' }, { question_id: 'Q2', text: 'Second question', mark_scheme: 'Second answer' }];
const topics = [{ Code: 'A', Name: 'Original topic', Description: 'Definition', 'Learning Outcomes': '' }];
const mapping = q => ({ question_id: q.question_id, primary_topic: 'A', topic_name: 'Original topic', secondary_topic: null, reason: 'Matched', needs_review: false, review_reason: null });
const openai = { chat: { completions: { create: async () => { throw new Error('Unexpected network call'); } } } };

test('durable jobs use safe IDs and repeated submission of the same ID returns the existing job', () => sandbox(async () => {
  const id = 'a'.repeat(64);
  const file = new File(['private source'], 'source.pdf', { type: 'application/pdf' });
  const first = await jobs.createMapperJob({ kind: 'extraction' }, [file, file], id);
  const second = await jobs.createMapperJob({ kind: 'extraction' }, [file, file], id);
  assert.equal(first.id, second.id);
  assert.equal((await jobs.listMapperJobs()).length, 1);
  assert.equal(await fs.readFile(path.join(jobs.mapperJobPath(id), 'source-0.pdf'), 'utf8'), 'private source');
  assert.throws(() => jobs.mapperJobPath('../outside'), /Invalid/);
  assert.equal(await jobs.readMapperJob('../outside'), undefined);
  await assert.rejects(jobs.createMapperJob({ kind: 'extraction' }, [], '../outside'), /Invalid/);
  const view = await jobs.mapperJobView(first);
  assert.equal(view.status, 'queued');
  assert.equal(view.result, undefined);
  assert.equal(view.sources, undefined);
}));

test('heartbeat rejects stale or wrong-version workers; expiry removes only owned job directories', () => sandbox(async folder => {
  assert.equal(await jobs.mapperWorkerAvailable(), false);
  const beat = value => atomicJSON(path.join(folder, 'heartbeat.json'), value);
  await beat({ at: Date.now(), version: 'old' });
  assert.equal(await jobs.mapperWorkerAvailable(), false);
  await beat({ at: Date.now() - 60000, version: MAPPER_EXTRACTION_VERSION });
  assert.equal(await jobs.mapperWorkerAvailable(), false);
  await beat({ at: Date.now(), version: MAPPER_EXTRACTION_VERSION });
  assert.equal(await jobs.mapperWorkerAvailable(), true);
  const job = await jobs.createMapperJob({ kind: 'mapping', questions, topics });
  job.expiresAt = Date.now() - 1;
  await jobs.saveMapperJob(job);
  await fs.mkdir(path.join(folder, 'keep-this'));
  await jobs.expireMapperJobs();
  assert.equal(await jobs.readMapperJob(job.id), undefined);
  assert.ok((await fs.stat(path.join(folder, 'keep-this'))).isDirectory());
}));

test('worker resumes per-question checkpoints, keeps original inputs, and cleans private inputs on success', () => sandbox(async () => {
  const job = await jobs.createMapperJob({ kind: 'mapping', questions, topics });
  job.status = 'running'; job.runs = 1;
  await jobs.saveMapperJob(job);
  await atomicJSON(path.join(jobs.mapperJobPath(job.id), 'mapping.json'), [mapping(questions[0])]);
  const called = [];
  const { runMapperJob } = loadModule('lib/mapper-job-runner.ts', {
    openai: class {},
    './mapper-extraction-service': { extractMapperDocuments: () => { throw new Error('Wrong pipeline'); } },
    './mapper-mapping-service': {
      mapQuestion: async (_client, q, t) => { called.push(q.question_id); assert.deepEqual(t, topics); return mapping(q); },
      mappingStats: results => ({ total: results.length }),
    },
  });
  await runMapperJob(job, openai);
  assert.deepEqual(called, ['Q2']);
  const view = await jobs.mapperJobView(await jobs.readMapperJob(job.id));
  assert.equal(view.status, 'succeeded');
  assert.deepEqual(view.result.questions, questions);
  assert.deepEqual(view.result.results, questions.map(mapping));
  await assert.rejects(fs.access(path.join(jobs.mapperJobPath(job.id), 'input.json')));
  await runMapperJob(await jobs.readMapperJob(job.id), openai);
  assert.deepEqual(called, ['Q2']);
}));

test('worker calls original extraction service with both original PDF buffers and preserves returned result', () => sandbox(async () => {
  const job = await jobs.createMapperJob({ kind: 'extraction' }, [new File(['QP'], 'qp.pdf'), new File(['MS'], 'ms.pdf')]);
  const result = { success: true, questions, count: 2, metadata: { extractionVersion: MAPPER_EXTRACTION_VERSION } };
  let calls = 0;
  const { runMapperJob } = loadModule('lib/mapper-job-runner.ts', {
    openai: class {}, './mapper-mapping-service': {},
    './mapper-extraction-service': { extractMapperDocuments: async (_client, qp, ms) => {
      calls++; assert.equal(qp.toString(), 'QP'); assert.equal(ms.toString(), 'MS'); return result;
    } },
  });
  await runMapperJob(job, openai);
  assert.equal(calls, 1);
  assert.deepEqual((await jobs.mapperJobView(await jobs.readMapperJob(job.id))).result, result);
  await assert.rejects(fs.access(path.join(jobs.mapperJobPath(job.id), 'source-0.pdf')));
}));

test('AI response checkpoints survive a new client; original request arguments are preserved', () => sandbox(async folder => {
  const { checkpointedMapperClient } = loadModule('lib/mapper-job-runner.ts', { openai: class {}, './mapper-mapping-service': {}, './mapper-extraction-service': {} });
  const args = { model: 'gpt-4o', temperature: 0, messages: [{ role: 'user', content: 'Original full prompt' }] };
  const response = { choices: [{ message: { content: 'Original answer' }, finish_reason: 'stop' }] };
  let calls = 0;
  const client = { chat: { completions: { create: async (actual, options) => { calls++; assert.deepEqual(actual, args); assert.equal(options.maxRetries, 0); return response; } } } };
  const make = () => checkpointedMapperClient(client, folder, Date.now() + 60000);
  assert.deepEqual(await make().chat.completions.create(args, { maxRetries: 0, timeout: 90000 }), response);
  assert.deepEqual(await make().chat.completions.create(args, { maxRetries: 0, timeout: 90000 }), response);
  assert.equal(calls, 1);
}));

test('repeated interrupted requests are bounded and extraction failures remain visible', () => sandbox(async folder => {
  const { checkpointedMapperClient, runMapperJob } = loadModule('lib/mapper-job-runner.ts', {
    openai: class {}, './mapper-mapping-service': {},
    './mapper-extraction-service': { extractMapperDocuments: async () => { throw new Error('Unreadable source'); } },
  });
  let attempts = 0;
  const client = checkpointedMapperClient({ chat: { completions: { create: async () => { attempts++; throw new Error('Interrupted'); } } } }, path.join(folder, 'cache'), Date.now() + 60000);
  for (let i = 0; i < 3; i++) await assert.rejects(client.chat.completions.create({ model: 'gpt-4o', messages: [] }));
  assert.equal(attempts, 2);
  const job = await jobs.createMapperJob({ kind: 'extraction' }, [new File(['QP'], 'qp'), new File(['MS'], 'ms')]);
  await runMapperJob(job, openai);
  const view = await jobs.mapperJobView(await jobs.readMapperJob(job.id));
  assert.equal(view.status, 'failed');
  assert.match(view.error, /Unreadable source/);
}));
