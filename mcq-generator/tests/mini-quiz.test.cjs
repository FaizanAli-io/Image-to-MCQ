const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { fixture, sectionFixture } = require('./ao3-fixtures.cjs');
const errors = loadModule('lib/mini-quiz-errors.ts');

function routeHarness(failAt) {
  const calls = { uploads: [], deleted: [], generations: [] };
  const { POST } = loadModule('app/api/generate-mini-quiz/route.ts', {
    '@/lib/mini-quiz-errors': errors,
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/openai': { generateMiniQuiz: async (...args) => {
      calls.generations.push(args);
      if (failAt === 'generation') throw new Error('Generation failed');
      if (failAt === 'invalid-evidence') throw new errors.MiniQuizEvidenceError(new Error('Missing graph data'));
      if (failAt === 'quality-review') return [{ text: 'Combined quiz', aoLevel: 'AO3', reviewStatus: 'recommended' }];
      return [{ text: 'Combined quiz' }];
    } },
    '@/lib/r2-client': {
      uploadToR2: async (_, name) => {
        if (failAt === 'second-upload' && calls.uploads.length === 1) throw new Error('Upload failed');
        calls.uploads.push(name);
        return name;
      },
      getSignedR2Url: async (key) => {
        if (failAt === 'signing') throw new Error('Signing failed');
        return `https://example.test/${key}`;
      },
      deleteFromR2: async (key) => {
        calls.deleted.push(key);
        if (failAt === 'deletion') throw new Error('Deletion failed');
      },
    },
  });
  return { calls, POST };
}

function request(count, field = 'images') {
  const data = new FormData();
  for (let i = 0; i < count; i++) data.append(field, new File(['page'], `page-${i}.png`, { type: 'image/png' }));
  data.append('educationLevel', 'GCSE');
  return { formData: async () => data };
}

test('mini quiz upload and generation flow', async (t) => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  try {
    for (const [count, field] of [[1, 'images'], [2, 'images'], [1, 'image']]) {
      await t.test(`${count} page(s) using ${field} produce one quiz`, async () => {
        const { POST, calls } = routeHarness();
        const result = await POST(request(count, field));
        assert.equal(result.status, 200);
        assert.equal(calls.generations.length, 1);
        assert.deepEqual(calls.generations[0][1], calls.uploads.map(key => `https://example.test/${key}`));
        assert.equal(calls.generations[0][1].length, count);
        assert.deepEqual(calls.deleted, calls.uploads);
      });
    }
    for (const count of [0, 3]) {
      await t.test(`rejects ${count} pages before uploading`, async () => {
        const { POST, calls } = routeHarness();
        assert.equal((await POST(request(count))).status, 400);
        assert.equal(calls.uploads.length, 0);
      });
    }
    await t.test('quality feedback returns HTTP 200 with draft status and cleans uploads', async () => {
      const { POST, calls } = routeHarness('quality-review');
      const result = await POST(request(2));
      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.equal(result.body.reviewStatus, 'recommended');
      assert.deepEqual(calls.deleted, calls.uploads);
    });
    await t.test('invalid evidence returns HTTP 422 and cleans uploads', async () => {
      const { POST, calls } = routeHarness('invalid-evidence');
      const result = await POST(request(2));
      assert.equal(result.status, 422);
      assert.equal(result.body.code, 'INVALID_AO3_EVIDENCE');
      assert.equal(result.body.success, false);
      assert.deepEqual(calls.deleted, calls.uploads);
    });
    for (const badEntry of ['not a file', new File(['text'], 'notes.txt', { type: 'text/plain' }), new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })]) {
      await t.test('validates every page before uploading', async () => {
        const req = request(1);
        (await req.formData()).append('images', badEntry);
        const { POST, calls } = routeHarness();
        assert.equal((await POST(req)).status, 400);
        assert.equal(calls.uploads.length, 0);
      });
    }
    for (const failure of ['second-upload', 'signing', 'generation', 'deletion']) {
      await t.test(`cleans all uploaded pages after ${failure} failure`, async () => {
        const { POST, calls } = routeHarness(failure);
        const result = await POST(request(2));
        assert.equal(result.status, failure === 'deletion' ? 200 : 500);
        assert.ok(calls.uploads.length > 0);
        assert.deepEqual(calls.deleted, calls.uploads);
      });
    }
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

for (const [level, count] of [['GCSE', 19], ['A-LEVEL', 20]]) {
  test(`${level}: both images reach all three parallel section requests with exact prompts`, async () => {
    const requests = [];
    const { generateMiniQuiz } = loadModule('lib/openai.ts', {
      './mini-quiz-prompts': loadModule('lib/mini-quiz-prompts.ts', {}),
      openai: class {
        chat = { completions: { create: async (payload) => {
          if (payload.response_format.json_schema.name === 'ao3_evidence_review') return { choices: [{ message: { content: JSON.stringify({ passes: true, issues: [] }) } }] };
          requests.push(payload);
          assert.equal(payload.response_format.type, 'json_schema');
          assert.equal(payload.response_format.json_schema.strict, true);
          return { choices: [{ message: { content: JSON.stringify(sectionFixture(fixture(level), payload.response_format.json_schema.name.slice(-3))) } }] };
        } } };
      },
    });
    const urls = ['https://example.test/one.png', 'https://example.test/two.png'];
    const questions = await generateMiniQuiz('test-only', urls, level);
    assert.equal(requests.length, 3);
    for (const payload of requests) {
      const section = payload.response_format.json_schema.name.slice(-3);
      const content = payload.messages[0].content;
      assert.deepEqual(content.filter(part => part.type === 'image_url').map(part => part.image_url.url), urls);
      assert.match(content[0].text, /BOTH pages/);
      const expectedCount = section === 'ao1' ? (level === 'GCSE' ? 10 : 8) : section === 'ao2' ? 6 : (level === 'GCSE' ? 3 : 6);
      assert.match(content[0].text, new RegExp(`EXACTLY ${expectedCount} questions`));
      if (section === 'ao2') assert.equal(content[1].text, loadModule('lib/mini-quiz-prompts.ts').getMiniQuizAO2Prompt(level));
      if (section === 'ao3') assert.equal(content[1].text, loadModule('lib/mini-quiz-ao3-prompts.ts').getMiniQuizAO3Prompt(level));
    }
    assert.equal(questions.length, count);
    assert.equal(questions.filter(q => q.aoLevel === 'AO2').length, 6);
    assert.equal(questions.filter(q => q.aoLevel === 'AO1').length, level === 'GCSE' ? 10 : 8);
    assert.deepEqual(questions[0].markScheme.ao3.map(m => m.questionNumber), level === 'GCSE' ? [17, 18, 19] : [15, 16, 17, 18, 19, 20]);
  });
}
