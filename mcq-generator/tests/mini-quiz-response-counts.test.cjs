const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { fixture, sectionFixture } = require('./ao3-fixtures.cjs');
const { reconcileMiniQuizMarks } = loadModule('lib/mini-quiz-marks.ts');

for (const level of ['GCSE', 'A-LEVEL']) for (const section of ['ao1', 'ao2', 'ao3']) {
  test(`${level} ${section}: question wording overrides conflicting count metadata`, () => {
    for (const metadata of [null, 1, 2, 3, 8]) {
      const raw = fixture(level);
      const entry = raw.markScheme[section][0];
      const q = raw.questions[entry.questionNumber - 1];
      q.text = 'Using the evidence, suggest one reason for the difference.';
      q.requestedResponses = metadata;
      entry.responseGroups = [[1], [2]];
      const before = [...entry.markPoints];
      reconcileMiniQuizMarks(raw, level);
      assert.equal(q.requestedResponses, 1);
      assert.equal(q.maxMarks, 2);
      assert.deepEqual(entry.markPoints, before);
      assert.deepEqual(entry.responseGroups, [[1, 2]]);
    }
  });
}

test('multiple requested answers keep valid marks when the repeated count is wrong', () => {
  const raw = fixture();
  raw.questions[8].text = 'Identify two variables and explain why each should be controlled.';
  raw.questions[8].requestedResponses = 4;
  const entry = raw.markScheme.ao2[0];
  entry.markPoints = ['Temperature [1]', 'Temperature explanation [1]', 'pH [1]', 'pH explanation [1]'];
  entry.responseGroups = [[1, 2], [3, 4]];
  reconcileMiniQuizMarks(raw, 'A-LEVEL');
  assert.equal(raw.questions[8].requestedResponses, 2);
  assert.equal(raw.questions[8].maxMarks, 4);
  assert.deepEqual(entry.responseGroups, [[1, 2], [3, 4]]);
});

test('compound instructions are counted together rather than using only the first number', () => {
  const raw = fixture();
  raw.questions[15].text = 'Give one limitation of the method and suggest one improvement.';
  raw.questions[15].requestedResponses = 1;
  raw.markScheme.ao3[1].responseGroups = [[1], [2]];
  reconcileMiniQuizMarks(raw, 'A-LEVEL');
  assert.equal(raw.questions[15].requestedResponses, 2);
  assert.deepEqual(raw.markScheme.ao3[1].responseGroups, [[1], [2]]);
});

test('fractional quantities and narrative counts are not interpreted as requested answers', () => {
  for (const text of ['Explain one-third of the measured value.', 'Students identify two variables during planning. Evaluate the conclusion.', 'Give 2.5 cm3 as the volume used in the calculation.']) {
    const raw = fixture();
    raw.questions[15].text = text;
    raw.questions[15].requestedResponses = 5;
    raw.markScheme.ao3[1].responseGroups = [[1], [2]];
    reconcileMiniQuizMarks(raw, 'A-LEVEL');
    assert.equal(raw.questions[15].requestedResponses, null);
    assert.equal(raw.questions[15].maxMarks, 2);
  }
});

test('missing or broken grouping hints do not discard complete marking points', () => {
  for (const groups of [undefined, [], [[1, 2, 3, 4]], [[1, 2], [2, 8]]]) {
    const raw = fixture();
    raw.questions[8].text = 'Identify two variables and explain why each should be controlled.';
    const entry = raw.markScheme.ao2[0];
    entry.markPoints = ['Temperature [1]', 'Temperature explanation [1]', 'pH [1]', 'pH explanation [1]'];
    entry.responseGroups = groups;
    reconcileMiniQuizMarks(raw, 'A-LEVEL');
    assert.equal(raw.questions[8].maxMarks, 4);
    assert.equal(entry.markPoints.length, 4);
  }
});

test('actual missing answers still fail instead of inventing marking points', () => {
  const raw = fixture();
  raw.questions[15].text = 'Suggest three limitations of the method.';
  raw.questions[15].requestedResponses = 2;
  assert.throws(() => reconcileMiniQuizMarks(raw, 'A-LEVEL'), /not enough marking points/);
  raw.questions[15].text = 'Identify two variables and explain why each should be controlled.';
  assert.throws(() => reconcileMiniQuizMarks(raw, 'A-LEVEL'), /own explanation point/);
});

test('Q16 metadata disagreement completes the actual generation flow in three calls', async () => {
  const raw = fixture();
  raw.questions[15].text = 'Suggest one reason for the difference between the results.';
  raw.questions[15].requestedResponses = 2;
  raw.markScheme.ao3[1].responseGroups = [[1], [2]];
  let calls = 0;
  const { generateMiniQuiz } = loadModule('lib/openai.ts', { openai: class {
    chat = { completions: { create: async payload => {
      calls++;
      return { choices: [{ message: { content: JSON.stringify(sectionFixture(raw, payload.response_format.json_schema.name.slice(-3))) } }] };
    } } };
  } });
  const questions = await generateMiniQuiz('test', ['source-image'], 'A-LEVEL');
  assert.equal(questions.length, 20);
  assert.equal(questions[15].maxMarks, 2);
  assert.equal(questions[15].text, raw.questions[15].text);
  assert.deepEqual(questions[15].markScheme.ao3[1].markPoints, raw.markScheme.ao3[1].markPoints);
  assert.equal(calls, 3);
});
