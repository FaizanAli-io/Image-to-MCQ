const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { extractQuestionBatches } = loadModule('lib/question-extraction.ts');

const question = id => ({ question_id: id, text: `Question ${id}`, mark_scheme: 'Answer' });
const response = (questions, finish_reason = 'stop') => ({
  choices: [{ finish_reason, message: { content: JSON.stringify({ questions }) } }],
});
const target = call => call.messages[1].content.split('TARGET SECTION:\n')[1].split('\n\nPAST PAPER AFTER')[0];

test('Plant Responses Q15a stays with its stem across the old 10000-character boundary', async () => {
  const stem = '15(a). Gibberellin causes stem elongation in plants.\n' + 'Context about internodal length. '.repeat(12)
    + '\nExplain why gibberellin is classed as a plant hormone.\n[3]\n(b). A scientist investigated cabbage plants.\ni. Plot the results.\n[4]\nii. State another role.\n[1]\n';
  const paper = '1. Earlier questions\n' + 'x'.repeat(9700) + '\n' + stem + '16. Identify two limitations.\n';
  const { client, calls } = harness(() => response([]));
  await extractQuestionBatches(client, '', paper, 'Mark scheme');
  assert.equal(calls.map(target).join(''), paper);
  assert.equal(calls.filter(call => target(call).includes(stem)).length, 1);
  assert.equal(calls.length, 2);
});

test('truncation recovery splits between complete questions', async () => {
  const first = '14. Evaluate the conclusion.\n' + 'context '.repeat(200) + '\n';
  const second = '15(a). Explain hormone action.\n' + 'context '.repeat(200) + '\n(b). Plot results.\n';
  const { client, calls } = harness(n => response([], n === 1 ? 'length' : 'stop'));
  await extractQuestionBatches(client, '', first + second, 'marks');
  assert.deepEqual(calls.slice(1).map(target), [first, second]);
});

test('a long question splits at a subpart and retains its parent as context', async () => {
  const first = '15(a). Explain the results.\n' + 'context '.repeat(1100) + '\n';
  const second = '(b). Interpret the table.\n' + 'context '.repeat(300);
  const { client, calls } = harness(() => response([]));
  await extractQuestionBatches(client, '', first + second, 'marks');
  assert.deepEqual(calls.map(target), [first, second]);
  assert.ok(calls[1].messages[1].content.includes(first));
});
function harness(reply) {
  const calls = [];
  return { calls, client: { chat: { completions: { create: async args => {
    calls.push(args);
    return reply(calls.length, args);
  } } } } };
}

test('batches a large paper without dropping context or the mark scheme', async () => {
  const paper = 'a'.repeat(65000) + 'END OF PAPER';
  const { client, calls } = harness(n => response([question(`Q${n}`)]));
  const result = await extractQuestionBatches(client, 'Extract JSON', paper, 'FULL MARK SCHEME');
  assert.equal(result.length, 7);
  const targets = calls.map(call => {
    const prompt = call.messages[1].content;
    assert.ok(prompt.includes('END OF PAPER'));
    assert.ok(prompt.includes('FULL MARK SCHEME'));
    return prompt.split('TARGET SECTION:\n')[1].split('\n\nPAST PAPER AFTER')[0];
  });
  assert.equal(targets.join(''), paper);
});

for (const failure of ['length', 'invalid-json', 'invalid-shape']) {
  test(`${failure} retries smaller sections without accepting partial data`, async () => {
    const { client, calls } = harness(n => n > 1 ? response([question(`Q${n}`)]) : {
      choices: [{ finish_reason: failure === 'length' ? 'length' : 'stop', message: {
        content: failure === 'invalid-shape' ? '{"questions":[null]}' : '{"questions":[{"text":"cut off',
      } }],
    });
    const result = await extractQuestionBatches(client, 'Extract JSON', 'a'.repeat(4000), 'marks');
    assert.equal(calls.length, 3);
    assert.deepEqual(result.map(q => q.question_id), ['Q2', 'Q3']);
  });
}

test('persistent truncation has bounded retries and a useful error', async () => {
  const { client, calls } = harness(() => response([], 'length'));
  await assert.rejects(extractQuestionBatches(client, '', 'a'.repeat(4000), ''), /smaller PDFs/);
  assert.equal(calls.length, 3);
});

test('empty cover sections are allowed', async () => {
  const { client } = harness(n => response(n === 1 ? [] : [question('Q1')]));
  assert.equal((await extractQuestionBatches(client, '', 'a'.repeat(11000), '')).length, 1);
});

test('refusals and API failures are not recursively retried', async () => {
  for (const reply of [
    () => ({ choices: [{ finish_reason: 'stop', message: { refusal: 'Refused', content: null } }] }),
    () => { throw new Error('Rate limit'); },
  ]) {
    const { client, calls } = harness(reply);
    await assert.rejects(extractQuestionBatches(client, '', 'a'.repeat(4000), ''));
    assert.equal(calls.length, 1);
  }
});

test('documents beyond the old limit are processed in bounded requests without losing source text', async () => {
  const paper = 'a'.repeat(95000) + 'LAST PAPER QUESTION';
  const marks = 'b'.repeat(100000) + 'LAST MARKING POINT';
  const { client, calls } = harness(() => ({ choices: [{ finish_reason: 'stop', message: {
    content: '{"entries":[]}',
  } }] }));
  await extractQuestionBatches(client, '', paper, marks);
  for (const [kind, expected] of [['questions', paper], ['marking points', marks]]) {
    const prompts = calls.map(call => call.messages[1].content).filter(prompt => prompt.startsWith(`DOCUMENT TYPE: ${kind}\n`));
    const sections = prompts.map(prompt => prompt.split('TARGET SECTION:\n')[1].split('\n\nAFTER (context only):')[0]);
    assert.equal(sections.join(''), expected);
    assert.ok(prompts.every(prompt => prompt.length < 29000));
  }
});
