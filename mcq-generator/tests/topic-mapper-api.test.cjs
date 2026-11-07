const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { getTopicMapperApiUrl, resolveTopicMapperApiBase } = loadModule('lib/topic-mapper-api.ts');
const { assertMapperExtractionVersion, MAPPER_EXTRACTION_VERSION } = loadModule('lib/topic-mapper-contract.ts');

test('development and production use their own app routes regardless of the old external API setting', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  try {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.test/';
    for (const environment of ['development', 'production']) {
      process.env.NODE_ENV = environment;
      for (const path of ['/api/extract-questions', '/api/map-questions']) {
        assert.equal(getTopicMapperApiUrl(path), path);
        const origin = environment === 'development' ? 'http://localhost:3000' : 'https://quizgenerator.pastpaperpal.co.uk';
        assert.equal(new URL(getTopicMapperApiUrl(path), origin).href, `${origin}${path}`);
      }
    }
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    assert.equal(getTopicMapperApiUrl('/api/extract-questions'), '/api/extract-questions');
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
  }
});

test('local preflight never contacts the remote backend, including when local extraction is unavailable', async () => {
  const originalEnv = process.env.NODE_ENV;
  const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NODE_ENV = 'development';
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.test';
  try {
    const calls = [];
    assert.equal(await resolveTopicMapperApiBase(async url => {
      calls.push(url);
      return { ok: true, json: async () => ({ extractionVersion: MAPPER_EXTRACTION_VERSION }) };
    }), '');
    assert.deepEqual(calls, ['/api/extract-questions']);
    await assert.rejects(resolveTopicMapperApiBase(async url => {
      assert.equal(url, '/api/extract-questions');
      throw new Error('Local server unavailable');
    }), /No PDFs were uploaded/);
  } finally {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
    if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
  }
});

test('preflight makes one same-origin version check without uploading PDFs or contacting the old API', async () => {
  const original = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.test';
  const calls = [];
  try {
    const base = await resolveTopicMapperApiBase(async (url, options) => {
      calls.push(url);
      assert.equal(options.cache, 'no-store');
      assert.equal(options.method, undefined);
      assert.equal(options.body, undefined);
      return { ok: true, json: async () => ({ extractionVersion: MAPPER_EXTRACTION_VERSION }) };
    });
    assert.equal(base, '');
    assert.deepEqual(calls, ['/api/extract-questions']);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = original;
  }
});

test('an unavailable deployed API does not silently fall back to an external service', async () => {
  const original = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.test';
  try {
    let calls = 0;
    await assert.rejects(resolveTopicMapperApiBase(async url => {
      calls++;
      assert.equal(url, '/api/extract-questions');
      return { ok: false, status: 503 };
    }), /No PDFs were uploaded/);
    assert.equal(calls, 1);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = original;
  }
});

test('legacy, absent, or inconsistent backend versions cannot silently reach mapping/export', async () => {
  for (const version of [undefined, null, 'document-batches-v3']) {
    assert.throws(() => assertMapperExtractionVersion(version), /update is not active/);
    await assert.rejects(resolveTopicMapperApiBase(async () => ({ ok: true, json: async () => ({ extractionVersion: version }) })), /No PDFs were uploaded/);
  }
  assert.doesNotThrow(() => assertMapperExtractionVersion(MAPPER_EXTRACTION_VERSION));
  await assert.rejects(resolveTopicMapperApiBase(async () => { throw new Error('Network error'); }), /service is unavailable/);
});
