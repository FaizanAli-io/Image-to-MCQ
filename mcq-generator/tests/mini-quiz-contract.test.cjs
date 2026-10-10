const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadModule } = require('./load-module.cjs');
const { fixture, sectionFixture } = require('./ao3-fixtures.cjs');
const { reconcileMiniQuizMarks } = loadModule('lib/mini-quiz-marks.ts');

test('all four production prompts equal the complete client attachment, character for character', () => {
  const original = fs.readFileSync(path.join(__dirname, '../docs/mini-quiz/client-prompts.txt'), 'utf8');
  const [ao2, ao3] = original.split('\r\nAO3\r\nGCSE\r\n');
  const expectedAO2 = ao2.slice('AO2\r\nGCSE\r\n'.length).split('\r\nA-Level\r\n');
  const expectedAO3 = ao3.split('\r\nA-Level\r\n');
  const { getMiniQuizAO2Prompt } = loadModule('lib/mini-quiz-prompts.ts');
  const { getMiniQuizAO3Prompt } = loadModule('lib/mini-quiz-ao3-prompts.ts');
  ['GCSE', 'A-LEVEL'].forEach((level, index) => {
    assert.equal(getMiniQuizAO2Prompt(level), expectedAO2[index]);
    assert.equal(getMiniQuizAO3Prompt(level), expectedAO3[index]);
  });
});

for (const level of ['GCSE', 'A-LEVEL']) {
  test(`${level}: every section derives marks from awarded points, preserving their content`, () => {
    const raw = fixture(level);
    const before = structuredClone(raw.markScheme);
    raw.questions.forEach(q => { q.maxMarks = 6; });
    reconcileMiniQuizMarks(raw, level);
    assert.ok(raw.questions.every(q => q.maxMarks === 2));
    assert.deepEqual(raw.markScheme, before);
  });
  for (const section of ['ao1', 'ao2', 'ao3']) {
    test(`${level} ${section}: reject missing, duplicated and unallocated marking points`, () => {
      for (const mutate of [
        raw => raw.markScheme[section].pop(),
        raw => { raw.markScheme[section][1].questionNumber = raw.markScheme[section][0].questionNumber; },
        raw => { raw.markScheme[section][0].markPoints = ['Same idea [1]', 'Same idea [1]']; },
        raw => { raw.markScheme[section][0].markPoints = ['One point [3]']; },
        raw => { raw.markScheme[section][0].markPoints = ['No allocation']; },
      ]) {
        const raw = fixture(level); mutate(raw);
        assert.throws(() => reconcileMiniQuizMarks(raw, level));
      }
    });
  }
}

test('an invalid evidence response fails locally without AI review or correction calls', async () => {
  let calls = 0;
  const raw = fixture();
  raw.questions[14].stimulusIds = ['missing'];
  const { generateMiniQuiz } = loadModule('lib/openai.ts', { openai: class {
    chat = { completions: { create: async payload => {
      calls++;
      return { choices: [{ message: { content: JSON.stringify(sectionFixture(raw, payload.response_format.json_schema.name.slice(-3))) }, finish_reason: 'stop' }] };
    } } };
  } });
  await assert.rejects(generateMiniQuiz('test-only', ['image'], 'A-LEVEL'), /missing or invalid/);
  assert.equal(calls, 3);
});

test('truncated JSON cannot become an exported quiz', async () => {
  const { generateMiniQuiz } = loadModule('lib/openai.ts', { openai: class {
    chat = { completions: { create: async () => ({ choices: [{
      message: { content: JSON.stringify(fixture()) }, finish_reason: 'length',
    }] }) } };
  } });
  await assert.rejects(generateMiniQuiz('test-only', ['image'], 'A-LEVEL'), /missing or invalid/);
});

test('local question prefixes are removed while numbers in the scenario remain intact', async () => {
  const { generateMiniQuiz } = loadModule('lib/openai.ts', { openai: class {
    chat = { completions: { create: async payload => {
      const section = payload.response_format.json_schema.name.slice(-3);
      const raw = sectionFixture(fixture(), section);
      if (section === 'ao2') {
        raw.questions[0].text = '1. A sample contains 16% oxygen. Explain the observation.';
        raw.questions[1].text = 'Question 2\nA second sample contains 21% oxygen. Compare the samples.';
        raw.questions[2].text = '3 samples were collected. Suggest a comparison.';
        raw.sourceKnowledge = [{ pageNumber: 1, quote: 'PRIVATE SOURCE' }];
        raw.applicationPlans = [{ scenarioInformation: 'PRIVATE PLAN' }];
      }
      return { choices: [{ message: { content: JSON.stringify(raw) } }] };
    } } };
  } });
  const questions = await generateMiniQuiz('test-only', ['image'], 'A-LEVEL');
  assert.equal(questions[8].questionNumber, 9);
  assert.equal(questions[8].text, 'A sample contains 16% oxygen. Explain the observation.');
  assert.equal(questions[9].text, 'A second sample contains 21% oxygen. Compare the samples.');
  assert.equal(questions[10].text, '3 samples were collected. Suggest a comparison.');
  assert.doesNotMatch(JSON.stringify(questions), /PRIVATE/);
});

test('all three sections start concurrently and settle before returning an API failure', async () => {
  const pending = [];
  const { generateMiniQuiz } = loadModule('lib/openai.ts', { openai: class {
    constructor(options) {
      assert.equal(options.maxRetries, 0);
      assert.equal(options.timeout, 75000);
    }
    chat = { completions: { create: payload => new Promise((resolve, reject) => {
      pending.push({ section: payload.response_format.json_schema.name.slice(-3), resolve, reject });
    }) } };
  } });
  let settled = false;
  const task = generateMiniQuiz('test-only', ['image'], 'A-LEVEL');
  const failure = new Error('Network unavailable');
  const assertion = assert.rejects(task, error => error === failure);
  task.then(() => { settled = true; }, () => { settled = true; });
  assert.equal(pending.length, 3);
  pending[0].reject(failure);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  for (const call of pending.slice(1)) {
    call.resolve({ choices: [{ message: { content: JSON.stringify(sectionFixture(fixture(), call.section)) } }] });
  }
  await assertion;
});

test('all-section PDF mark schemes retain long marking points across page breaks', async () => {
  const { studentQuestions } = require('./ao3-fixtures.cjs');
  const { getDocumentProxy } = require('unpdf');
  const { generatePDF } = loadModule('lib/pdf-utils.ts');
  const raw = fixture();
  for (const section of ['ao1', 'ao2', 'ao3']) {
    for (const entry of raw.markScheme[section]) {
      entry.markPoints = Array.from({ length: 4 }, (_, i) =>
        `Marker ${section} question ${entry.questionNumber} point ${i + 1}: ${'A long but complete marking point with supporting reasoning. '.repeat(8)} [1]`);
    }
  }
  reconcileMiniQuizMarks(raw, 'A-LEVEL');
  const pdf = await getDocumentProxy(new Uint8Array(generatePDF(studentQuestions(raw)).output('arraybuffer')));
  let text = '';
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { items } = await page.getTextContent();
    text += items.map(i => i.str).join(' ') + '\n';
    for (const item of items.filter(i => i.str.trim())) {
      assert.ok(item.transform[5] > 12 && item.transform[5] < page.view[3] - 10, item.str);
    }
  }
  for (const section of ['ao1', 'ao2', 'ao3']) {
    for (const entry of raw.markScheme[section]) {
      for (let point = 1; point <= 4; point++) {
        assert.ok(text.includes(`Marker ${section} question ${entry.questionNumber} point ${point}:`));
      }
    }
  }
});
