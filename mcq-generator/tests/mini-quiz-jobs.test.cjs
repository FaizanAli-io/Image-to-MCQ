const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { loadModule } = require('./load-module.cjs');
const { fixture, sectionFixture } = require('./ao3-fixtures.cjs');
const store = loadModule('lib/mini-quiz-jobs.ts');

test('EC2 durable jobs, checkpoints, status endpoint and restart recovery', async t => {
  const previous = { dir: process.env.MINI_QUIZ_JOB_DIR, api: process.env.OPENAI_API_KEY, background: process.env.MINI_QUIZ_BACKGROUND_JOBS };
  const root = await fs.mkdtemp(path.join(__dirname, '../.mini-quiz-jobs-test-'));
  process.env.MINI_QUIZ_JOB_DIR = root;
  process.env.OPENAI_API_KEY = 'test-only';
  try {
    const images = Array.from({ length: 10 }, (_, i) => new File([`source ${i}`], `image${i}.png`, { type: 'image/png' }));
    const job = await store.createJob(images, 'A-LEVEL');
    assert.match(job.id, /^[a-f0-9]{64}$/);
    assert.equal((await store.readJob(job.id)).sources.length, 10);
    assert.equal(await store.readJob('../outside'), undefined);
    assert.equal(await store.workerAvailable(), false);
    await store.atomicJSON(path.join(root, 'heartbeat.json'), { at: Date.now() });
    assert.equal(await store.workerAvailable(), true);
    assert.doesNotMatch(JSON.stringify(store.publicJob(job)), /source-|attempts|createdAt/);

    await t.test('202 response enqueues without generating or uploading to R2', async () => {
      process.env.MINI_QUIZ_BACKGROUND_JOBS = 'true';
      const { POST } = loadModule('app/api/generate-mini-quiz/route.ts', {
        'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        '@/lib/openai': { generateMiniQuiz: () => { throw new Error('must not generate in HTTP request'); } },
        '@/lib/r2-client': { uploadToR2: () => { throw new Error('must not upload in HTTP request'); } },
      });
      const data = new FormData(); data.append('educationLevel', 'A-LEVEL'); data.append('images', images[0]);
      const result = await POST({ formData: async () => data });
      assert.equal(result.status, 202);
      assert.equal((await store.readJob(result.body.jobId)).status, 'queued');
      await fs.rm(path.join(root, 'heartbeat.json'));
      assert.equal((await POST({ formData: async () => data })).status, 503);
    });

    // Emulate a process restart after AO1 was validated and durably checkpointed.
    const ao1 = sectionFixture(fixture(), 'ao1');
    await store.saveSection(job.id, 'ao1', ao1);
    job.status = 'running'; job.attempts = { ao1: 1 }; job.completed = ['ao1']; await store.saveJob(job);
    const uploads = [], deletes = [];
    let active = 0, peak = 0;
    const { runMiniQuizJob } = loadModule('lib/mini-quiz-job-runner.ts', {
      './openai': { generateMiniQuiz: async (_key, urls, level, options) => {
        assert.equal(level, 'A-LEVEL'); assert.equal(urls.length, 10);
        assert.deepEqual(options.completed.ao1, ao1);
        assert.equal(options.attempts.ao1, 1);
        await Promise.all(['ao2', 'ao3'].map(async section => {
          await options.onAttempt(section, 1);
          await options.onSection(section, sectionFixture(fixture(), section));
        }));
        return [{ text: 'Finished quiz', educationLevel: level }];
      } },
      './r2-client': {
        uploadToR2: async (_buffer, _name, _type, key) => {
          active++; peak = Math.max(peak, active); uploads.push(key);
          await new Promise(resolve => setImmediate(resolve)); active--; return key;
        },
        getSignedR2Url: async key => `https://example.test/${key}`,
        deleteFromR2: async key => { deletes.push(key); },
      },
    });
    await runMiniQuizJob(await store.readJob(job.id));
    assert.ok(peak >= 1 && peak <= 3, 'upload concurrency is bounded at three');
    assert.equal(uploads.length, 10); assert.equal(deletes.length, 10);
    const finished = await store.readJob(job.id);
    assert.equal(finished.status, 'succeeded');
    assert.equal(finished.completed.length, 3);
    assert.equal(Object.keys(await store.readSections(job.id)).length, 3);
    assert.deepEqual(finished.attempts, { ao1: 1, ao2: 1, ao3: 1 });
    await assert.rejects(fs.access(path.join(store.jobPath(job.id), 'source-0')));
    const { GET } = loadModule('app/api/mini-quiz-jobs/[id]/route.ts', {
      'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200, headers: options?.headers }) } },
    });
    const status = await GET({}, { params: Promise.resolve({ id: job.id }) });
    assert.equal(status.body.questions[0].text, 'Finished quiz');
    assert.equal(status.headers['Cache-Control'], 'no-store');
    assert.doesNotMatch(JSON.stringify(status.body), /example.test|source-0|markScheme|attempts/);
    finished.expiresAt = Date.now() - 1; await store.saveJob(finished);
    assert.equal((await GET({}, { params: Promise.resolve({ id: job.id }) })).status, 404);
  } finally {
    if (previous.dir === undefined) delete process.env.MINI_QUIZ_JOB_DIR; else process.env.MINI_QUIZ_JOB_DIR = previous.dir;
    if (previous.api === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.api;
    if (previous.background === undefined) delete process.env.MINI_QUIZ_BACKGROUND_JOBS; else process.env.MINI_QUIZ_BACKGROUND_JOBS = previous.background;
    // root is a mkdtemp path beneath this test workspace, never an environment path.
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('polling returns completed jobs and distinguishes terminal failure from reconnectable failure', async () => {
  const { pollMiniQuiz, MiniQuizJobError } = loadModule('lib/mini-quiz-poll.ts');
  const previous = global.fetch;
  const signal = new AbortController().signal;
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ status: 'succeeded', questions: [{ text: 'done' }] }) });
    assert.equal((await pollMiniQuiz('id', signal, () => {}))[0].text, 'done');
    global.fetch = async () => ({ ok: true, json: async () => ({ status: 'failed', error: 'failed after recovery', code: 'QUIZ_GENERATION_FAILED' }) });
    await assert.rejects(pollMiniQuiz('id', signal, () => {}), e => e instanceof MiniQuizJobError && e.terminal && e.code === 'QUIZ_GENERATION_FAILED');
    global.fetch = async () => ({ status: 404 });
    await assert.rejects(pollMiniQuiz('id', signal, () => {}), e => e.terminal && e.code === 'JOB_NOT_FOUND');
  } finally { global.fetch = previous; }
});
