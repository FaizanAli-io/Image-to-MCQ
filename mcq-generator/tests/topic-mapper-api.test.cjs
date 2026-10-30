const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { getTopicMapperApiUrl } = loadModule('lib/topic-mapper-api.ts');

test('topic mapper uses the configured API host in development and production', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  try {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.test/';
    for (const environment of ['development', 'production']) {
      process.env.NODE_ENV = environment;
      for (const path of ['/api/extract-questions', '/api/map-questions']) {
        assert.equal(getTopicMapperApiUrl(path), `https://api.example.test${path}`);
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
