const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const errors = loadModule('lib/retrieval-quiz-errors.ts');

function request(count = 3, level = 'GCSE', badEntry) {
  const data = new FormData();
  for (let i = 0; i < count; i++) data.append('images', i === 1 && badEntry !== undefined
    ? badEntry : new File(['source'], `page-${i}.png`, { type: 'image/png' }));
  data.append('educationLevel', level);
  return { formData: async () => data };
}
function harness(failure) {
  const calls = { uploaded: [], deleted: [], generated: [] };
  const { POST } = loadModule('app/api/generate-questions-r2/route.ts', {
    '@/lib/retrieval-quiz-errors': errors,
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/openai': { generateAndShuffleRetrievalQuiz: async (...args) => {
      calls.generated.push(args);
      if (failure === 'validation') throw new errors.RetrievalQuizValidationError();
      if (failure === 'generation') throw new Error('Generation failed');
      return { questions: [{ text: 'Generated question' }], originalAnswerKey: ['a'], shuffledAnswerKey: ['c'] };
    } },
    '@/lib/r2-client': {
      uploadToR2: async (_, name) => {
        if (failure === 'upload' && name === 'page-0.png') throw new Error('Upload failed');
        // Deliberately finish late: failure cleanup must await this upload.
        if (name === 'page-2.png') await new Promise(resolve => setTimeout(resolve, 20));
        calls.uploaded.push(name);
        return name;
      },
      getSignedR2Url: async key => {
        if (failure === 'signing' && key === 'page-0.png') throw new Error('Signing failed');
        return `https://example.test/${key}`;
      },
      deleteFromR2: async key => { calls.deleted.push(key); },
    },
  });
  return { POST, calls };
}

test('retrieval route returns generated data or fails without leaving temporary images', async t => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  try {
    for (const failure of [undefined, 'validation', 'generation', 'upload', 'signing']) {
      await t.test(failure || 'success', async () => {
        const { POST, calls } = harness(failure);
        const response = await POST(request());
        assert.equal(response.status, !failure ? 200 : failure === 'validation' ? 422 : 500);
        assert.deepEqual([...calls.deleted].sort(), [...calls.uploaded].sort());
        if (failure) assert.equal(response.body.questions, undefined);
        if (failure === 'validation') {
          assert.equal(response.body.code, 'RETRIEVAL_VALIDATION_FAILED');
          assert.equal(response.body.success, false);
        }
        if (!failure) {
          assert.deepEqual(calls.generated[0][1], ['page-0.png', 'page-1.png', 'page-2.png'].map(p => `https://example.test/${p}`));
          assert.equal(response.body.success, true);
        }
      });
    }
    for (const input of [request(2), request(4), request(3, 'unknown'), request(3, 'GCSE', 'not a file'),
      request(3, 'GCSE', new File(['text'], 'notes.txt', { type: 'text/plain' })),
      request(3, 'GCSE', new File([], 'empty.png', { type: 'image/png' })),
      request(3, 'GCSE', new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))]) {
      const { POST, calls } = harness();
      assert.equal((await POST(input)).status, 400);
      assert.equal(calls.uploaded.length, 0);
      assert.equal(calls.generated.length, 0);
    }
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
