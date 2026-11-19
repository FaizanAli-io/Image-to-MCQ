const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { claimJobTab, MINI_JOB_KEY, MAPPER_JOB_KEY, jobSession } = loadModule('lib/job-session.ts');

function storage(entries = []) {
  const data = new Map(entries);
  return { data, getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function lockManager() {
  const held = new Set();
  return { held, request(name, options, callback) {
    assert.equal(options.ifAvailable, true);
    if (held.has(name)) return Promise.resolve(callback(null));
    held.add(name);
    return Promise.resolve(callback({ name }));
  } };
}

test('new tabs have independent jobs; duplicate tabs discard only their copied jobs', async () => {
  const locks = lockManager();
  const original = storage([[MINI_JOB_KEY, 'mini'], [MAPPER_JOB_KEY, 'mapper'], ['preference', 'kept']]);
  await claimJobTab(original, locks);
  const duplicate = storage(original.data);
  await claimJobTab(duplicate, locks);
  assert.equal(duplicate.getItem(MINI_JOB_KEY), null);
  assert.equal(duplicate.getItem(MAPPER_JOB_KEY), null);
  assert.equal(duplicate.getItem('preference'), 'kept');
  assert.equal(original.getItem(MINI_JOB_KEY), 'mini');
  assert.equal(original.getItem(MAPPER_JOB_KEY), 'mapper');
  const fresh = storage();
  await claimJobTab(fresh, locks);
  fresh.setItem(MINI_JOB_KEY, 'another-mini');
  assert.equal(original.getItem(MINI_JOB_KEY), 'mini');
  assert.equal(locks.held.size, 3);
});

test('refresh keeps saved jobs after the old document releases its lock', async () => {
  const store = storage([[MINI_JOB_KEY, 'mini'], [MAPPER_JOB_KEY, 'mapper']]);
  const locks = lockManager();
  await claimJobTab(store, locks);
  locks.held.clear(); // Browser unload releases document locks.
  await claimJobTab(store, locks);
  assert.equal(store.getItem(MINI_JOB_KEY), 'mini');
  assert.equal(store.getItem(MAPPER_JOB_KEY), 'mapper');
});

test('unavailable or rejected lock API does not prevent generation recovery', async () => {
  const store = storage([[MINI_JOB_KEY, 'mini']]);
  await claimJobTab(store, undefined);
  await claimJobTab(store, { request: () => Promise.reject(new Error('disabled')) });
  assert.equal(store.getItem(MINI_JOB_KEY), 'mini');
});

test('storage and cleanup use this tab only and preserve newer job references', () => {
  const store = storage();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: store });
  try {
    jobSession.setItem(MINI_JOB_KEY, 'new');
    const { forgetPendingMiniQuiz } = loadModule('lib/mini-quiz-poll.ts');
    forgetPendingMiniQuiz('old');
    assert.equal(jobSession.getItem(MINI_JOB_KEY), 'new');
    forgetPendingMiniQuiz('new');
    assert.equal(jobSession.getItem(MINI_JOB_KEY), null);
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('disabled'); } });
    assert.equal(jobSession.getItem(MINI_JOB_KEY), null);
    assert.doesNotThrow(() => jobSession.setItem(MINI_JOB_KEY, 'new'));
    assert.doesNotThrow(() => jobSession.removeItem(MINI_JOB_KEY));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor);
    else delete globalThis.sessionStorage;
  }
});
