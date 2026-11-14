const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { readMapperResponse, pollMapperJob } = loadModule('lib/mapper-job-client.ts');

test('Cloudflare HTML errors show a useful timeout message rather than a JSON syntax exception', async () => {
  await assert.rejects(readMapperResponse(new Response('<!DOCTYPE html><h1>Cloudflare timeout</h1>', { status: 524 })), /connection timed out.*saved job/i);
  await assert.rejects(readMapperResponse(new Response('<html>Bad gateway</html>', { status: 502 })), /HTTP 502/);
  await assert.rejects(readMapperResponse(Response.json({ error: 'Worker offline' }, { status: 503 })), /Worker offline/);
});

test('reconnecting to a completed job only reads status and never submits another job', async () => {
  const id = 'a'.repeat(64);
  const job = { jobId: id, status: 'succeeded', kind: 'extraction', result: { questions: [] } };
  let calls = 0;
  const fetcher = async (url, options) => { calls++; assert.equal(url, `/api/mapper-jobs/${id}`); assert.equal(options.method, undefined); assert.equal(options.body, undefined); return Response.json(job); };
  assert.deepEqual(await pollMapperJob(id, () => {}, new AbortController().signal, fetcher), job);
  assert.deepEqual(await pollMapperJob(id, () => {}, new AbortController().signal, fetcher), job);
  assert.equal(calls, 2);
});

test('cancelling the view stops polling without sending a cancellation or new generation request', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(pollMapperJob('a'.repeat(64), () => {}, controller.signal, () => { throw new Error('Should not fetch'); }), /Polling stopped/);
  await assert.rejects(pollMapperJob('../outside', () => {}, new AbortController().signal), /Invalid saved/);
});
