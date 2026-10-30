const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { extractLargeDocuments } = loadModule('lib/large-document-extraction.ts');

const response = entries => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ entries }) } }] });
function harness(reply) {
  const calls = [];
  return { calls, client: { chat: { completions: { create: async args => {
    calls.push(args);
    return reply(args, calls.length);
  } } } } };
}
const isPaper = args => args.messages[1].content.startsWith('DOCUMENT TYPE: questions\n');

test('matches exact hierarchical IDs, preserving unmatched questions and all marking blocks', async () => {
  const { client } = harness(args => response(isPaper(args) ? [
    { question_id: 'Q01(a)(i)', content: 'First question' },
    { question_id: '1.1', content: 'Decimal question' },
    { question_id: '11', content: 'Question eleven' },
  ] : [
    { question_id: '1ai', content: 'First answer' },
    { question_id: 'Q1ai', content: 'Alternative answer' },
    { question_id: '01.01', content: 'Decimal answer' },
  ]));
  const result = await extractLargeDocuments(client, 'paper', 'marks');
  assert.deepEqual(result.map(q => q.mark_scheme), ['First answer\nAlternative answer', 'Decimal answer', '[Mark scheme not matched - manual review required]']);
});

for (const kind of ['questions', 'marking points']) {
  for (const failure of ['length', 'invalid-json']) {
    test(`${kind}: recovers from ${failure} without keeping partial output`, async () => {
      let failed = false;
      const { client, calls } = harness(args => {
        if (!failed && args.messages[1].content.startsWith(`DOCUMENT TYPE: ${kind}\n`)) {
          failed = true;
          return { choices: [{ finish_reason: failure === 'length' ? 'length' : 'stop', message: { content: '{"entries":[{"content":"' } }] };
        }
        return response([{ question_id: 'Q1a', content: isPaper(args) ? 'Question' : 'Answer' }]);
      });
      const result = await extractLargeDocuments(client, 'x'.repeat(4000), 'y'.repeat(4000));
      assert.equal(calls.length, 4);
      assert.deepEqual(result, [{ question_id: 'Q1a', text: 'Question', mark_scheme: 'Answer' }]);
    });
  }
}

test('persistent malformed output stops retrying and never reports success', async () => {
  const { client, calls } = harness(args => isPaper(args)
    ? { choices: [{ finish_reason: 'stop', message: { content: 'broken JSON' } }] }
    : response([]));
  await assert.rejects(extractLargeDocuments(client, 'x'.repeat(4000), 'marks'), /could not extract questions.*Invalid JSON/);
  assert.equal(calls.length, 5);
});

test('retries shrink surrounding context as well as the target section', async () => {
  const { client, calls } = harness(args => isPaper(args)
    ? { choices: [{ finish_reason: 'length', message: { content: '{' } }] }
    : response([]));
  await assert.rejects(extractLargeDocuments(client, 'a'.repeat(4000) + 'b'.repeat(16000), 'marks'), /finish_reason=length/);
  const attempts = calls.filter(args => isPaper(args) && args.messages[1].content.split('TARGET SECTION:\n')[1].startsWith('a'));
  for (let i = 1; i < attempts.length; i++) {
    assert.ok(attempts[i].messages[1].content.length < attempts[i - 1].messages[1].content.length);
  }
  assert.ok(attempts.at(-1).messages[1].content.length < 3000);
  assert.ok(attempts.every(call => call.response_format.type === 'json_schema' && call.response_format.json_schema.strict));
});

test('decorative PDF answer lines are collapsed without removing question text or marks', async () => {
  const paper = '49. First measure' + '_ '.repeat(1000) + '\nDifficulty' + '.'.repeat(1000) + ' [4]';
  const { client, calls } = harness(() => response([]));
  await extractLargeDocuments(client, paper, 'marks');
  const prompt = calls.find(isPaper).messages[1].content;
  assert.ok(prompt.includes('49. First measure____ '));
  assert.ok(prompt.includes('Difficulty.... [4]'));
  assert.ok(prompt.length < 1000);
});

test('section boundaries preserve lines and unicode source text', async () => {
  const paper = ('Question context \u03b1\u03b2\u03b3\n').repeat(1200);
  const { client, calls } = harness(() => response([]));
  await extractLargeDocuments(client, paper, 'marks');
  const sections = calls.filter(isPaper).map(args => args.messages[1].content.split('TARGET SECTION:\n')[1].split('\n\nAFTER (context only):')[0]);
  assert.equal(sections.join(''), paper);
  assert.ok(sections.every(part => part.length <= 8000));
});

test('a focused second pass recovers marking rows missed in the first pass', async () => {
  const { client, calls } = harness(args => response(isPaper(args)
    ? [{ question_id: 'Q2a', content: 'Name the gas.' }]
    : args.messages[0].content.includes('FOCUSED MATCHING PASS')
      ? [{ question_id: 'Q2a', content: 'Hydrogen.' }]
      : []));
  const result = await extractLargeDocuments(client, 'Question 2a: Name the gas.', '2(a) Hydrogen.');
  assert.equal(calls.length, 3);
  assert.equal(result[0].mark_scheme, 'Hydrogen.');
});

test('a failed document cancels the other in-flight document request', async () => {
  let cancelled = false;
  const client = { chat: { completions: { create: async (args, options) => {
    assert.equal(options.timeout, 90000);
    assert.equal(options.maxRetries, 0);
    if (isPaper(args)) throw new Error('Upstream unavailable');
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        cancelled = true;
        reject(new Error('Cancelled'));
      }, { once: true });
    });
  } } } };
  await assert.rejects(extractLargeDocuments(client, 'paper', 'marks'), /Upstream unavailable/);
  assert.equal(cancelled, true);
});
