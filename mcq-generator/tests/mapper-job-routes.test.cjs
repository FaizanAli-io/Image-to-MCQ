const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { MAPPER_EXTRACTION_VERSION } = loadModule('lib/topic-mapper-contract.ts');
const next = { NextResponse: { json: (value, options) => Response.json(value, options) } };

test('extraction POST returns a durable job acknowledgement without loading extraction/AI services', async () => {
  let enqueued = 0;
  const id = 'b'.repeat(64);
  const route = loadModule('app/api/extract-questions/route.ts', {
    'next/server': next,
    '@/lib/mapper-jobs': {
      mapperWorkerAvailable: async () => true,
      createMapperJob: async (input, files, requestedId) => {
        enqueued++;
        assert.equal(input.kind, 'extraction'); assert.equal(files.length, 2); assert.equal(requestedId, id);
        return { id, kind: 'extraction', status: 'queued' };
      },
    },
  });
  const form = new FormData();
  form.set('pastPaper', new File(['QP'], 'qp.pdf', { type: 'application/pdf' }));
  form.set('markScheme', new File(['MS'], 'ms.pdf', { type: 'application/pdf' }));
  const response = await route.POST({ headers: new Headers({ 'X-Mapper-Request-Id': id }), formData: async () => form });
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('X-Extraction-Version'), MAPPER_EXTRACTION_VERSION);
  assert.equal((await response.json()).jobId, id);
  assert.equal(enqueued, 1);
});

test('mapping POST enqueues unchanged questions and topics instead of running classification in HTTP', async () => {
  const body = { questions: [{ question_id: 'Q1', text: 'Original text', mark_scheme: 'Original criteria', source_marks: 2 }], topics: [{ Code: 'A', Name: 'Original topic' }] };
  const route = loadModule('app/api/map-questions/route.ts', {
    'next/server': next,
    '@/lib/mapper-jobs': {
      mapperWorkerAvailable: async () => true,
      createMapperJob: async input => { assert.deepEqual(input, { kind: 'mapping', ...body }); return { id: 'c'.repeat(64), kind: 'mapping', status: 'queued' }; },
    },
  });
  const response = await route.POST({ text: async () => JSON.stringify(body), headers: new Headers() });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).status, 'queued');
});

test('missing worker is reported immediately and no job is queued', async () => {
  const route = loadModule('app/api/map-questions/route.ts', {
    'next/server': next,
    '@/lib/mapper-jobs': { mapperWorkerAvailable: async () => false, createMapperJob: () => { throw new Error('Must not enqueue'); } },
  });
  const response = await route.POST({ text: async () => JSON.stringify({ questions: [{ question_id: 'Q1', text: 'Question' }], topics: [{ Code: 'A', Name: 'Topic' }] }) });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /worker is unavailable/);
});
