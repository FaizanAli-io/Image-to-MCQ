const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { fixture, sectionFixture } = require('./ao3-fixtures.cjs');
const { reconcileMiniQuizMarks } = loadModule('lib/mini-quiz-marks.ts');

for (const level of ['GCSE', 'A-LEVEL']) {
  test(`${level}: safely remove redundant/blank points and remap indices without extra marks`, () => {
    const raw = fixture(level), entry = raw.markScheme.ao2[0];
    entry.markPoints.push('  FIRST   distinct evidence point [1]', ' ', '[1]');
    entry.responseGroups = [[1, 2, 3, 4, 5]];
    raw.questions[entry.questionNumber - 1].text = 'Explain one reason for the observation.';
    reconcileMiniQuizMarks(raw, level);
    assert.equal(entry.markPoints.length, 2);
    assert.equal(raw.questions[entry.questionNumber - 1].maxMarks, 2);
    assert.deepEqual(entry.responseGroups, [[1, 2]]);
  });

  test(`${level}: never lower marks to hide missing explanations; preserve separate groups`, () => {
    const raw = fixture(level), entry = raw.markScheme.ao2[0];
    const q = raw.questions[entry.questionNumber - 1];
    q.text = 'Give two variables and explain each.';
    q.maxMarks = 4;
    entry.markPoints = ['Variable A [1]', 'Explanation A [1]', 'Variable A [1]', 'Explanation A [1]'];
    assert.throws(() => reconcileMiniQuizMarks(raw, level), /confirm answer completeness/);
    const grouped = fixture(level), m = grouped.markScheme.ao2[0];
    const question = grouped.questions[m.questionNumber - 1];
    question.text = 'Give two observations.';
    m.markPoints = ['Same text in separate subparts [1]', 'Same text in separate subparts [1]'];
    m.responseGroups = [[1], [2]];
    reconcileMiniQuizMarks(grouped, level);
    assert.equal(m.markPoints.length, 2);
    assert.deepEqual(m.responseGroups, [[1], [2]]);
  });

  test(`${level}: missing stimulus recovery retries only AO3 with source images and original prompts`, async () => {
    const calls = { ao1: 0, ao2: 0, ao3: 0 }, saved = {};
    const { generateMiniQuiz } = loadModule('lib/openai.ts', { openai: class {
      chat = { completions: { create: async payload => {
        const section = payload.response_format.json_schema.name.slice(-3);
        const draft = sectionFixture(fixture(level), section);
        calls[section]++;
        if (section === 'ao3' && calls.ao3 === 1) draft.questions[0].stimulusIds = ['s4'];
        if (section === 'ao3' && calls.ao3 === 2) {
          const content = payload.messages[0].content;
          assert.match(content[2].text, /references missing stimuli: s4/);
          assert.ok(content.some(p => p.image_url?.url === 'source-url'));
          assert.equal(content[1].text, loadModule('lib/mini-quiz-ao3-prompts.ts').getMiniQuizAO3Prompt(level));
        }
        return { choices: [{ message: { content: JSON.stringify(draft) } }] };
      } } };
    } });
    const result = await generateMiniQuiz('test', ['source-url'], level, { onSection: async (key, value) => { saved[key] = value; } });
    assert.deepEqual(calls, { ao1: 1, ao2: 1, ao3: 2 });
    assert.equal(Object.keys(saved).length, 3);
    assert.ok(result.filter(q => q.aoLevel === 'AO3').every(q => q.stimuli.length > 0 && q.stimuli.every(Boolean)));
  });
}

test('AO2 repair keeps valid neighbouring questions and answer mapping intact', async () => {
  let ao2Calls = 0;
  const raw = fixture();
  const { generateMiniQuiz } = loadModule('lib/openai.ts', { openai: class {
    chat = { completions: { create: async payload => {
      const section = payload.response_format.json_schema.name.slice(-3);
      const draft = sectionFixture(structuredClone(raw), section);
      if (section === 'ao2') {
        ao2Calls++;
        if (ao2Calls === 1) draft.markScheme[3].markPoints = ['Duplicate [1]', 'Duplicate [1]'];
        else { draft.questions[0].text = 'UNWANTED EDIT'; draft.markScheme[0].markPoints = ['UNWANTED ANSWER [1]']; }
      }
      return { choices: [{ message: { content: JSON.stringify(draft) } }] };
    } } };
  } });
  const result = await generateMiniQuiz('test', ['source'], 'A-LEVEL');
  assert.equal(ao2Calls, 2);
  assert.equal(result[8].text, raw.questions[8].text);
  assert.doesNotMatch(JSON.stringify(result), /UNWANTED/);
  assert.deepEqual(result[0].markScheme.ao2[3].markPoints, raw.markScheme.ao2[3].markPoints);
});

test('saved sections bypass generation, transient failure retries once, auth failure does not retry', async () => {
  const { recoverMiniSection } = loadModule('lib/mini-quiz-recovery.ts');
  const draft = sectionFixture(fixture(), 'ao1');
  let calls = 0;
  await recoverMiniSection('ao1', 'A-LEVEL', { completed: { ao1: draft } }, async () => { throw new Error('must not call'); });
  await recoverMiniSection('ao1', 'A-LEVEL', {}, async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('temporary'), { status: 500 });
    return draft;
  });
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(recoverMiniSection('ao1', 'A-LEVEL', {}, async () => { calls++; throw Object.assign(new Error('auth'), { status: 401 }); }), /auth/);
  assert.equal(calls, 1);
  await assert.rejects(recoverMiniSection('ao1', 'A-LEVEL', { attempts: { ao1: 2 } }, async () => { throw new Error('must not call'); }), /attempts exhausted/);
});

test('AO3 generation schema cannot emit s4 in references or definitions at either level', () => {
  const Ajv = require('ajv');
  const { getMiniQuizSectionSchema } = loadModule('lib/mini-quiz-schema.ts');
  for (const level of ['GCSE', 'A-LEVEL']) {
    const schema = getMiniQuizSectionSchema(level, 'ao3');
    const refs = new Ajv().compile(schema.properties.questions.items.properties.stimulusIds);
    assert.ok(refs(['s1', 's3'])); assert.equal(refs(['s4']), false);
    const id = new Ajv().compile(schema.properties.stimuli.items.anyOf[0].properties.id);
    assert.ok(id('s3')); assert.equal(id('s4'), false);
  }
});

test('exhausted marking recovery reports the correct global question number', async () => {
  const { recoverMiniSection } = loadModule('lib/mini-quiz-recovery.ts');
  const draft = sectionFixture(fixture(), 'ao2');
  draft.markScheme[3].markPoints = ['Same [1]', 'Same [1]'];
  await assert.rejects(recoverMiniSection('ao2', 'A-LEVEL', {}, async () => draft), /Q12: marking cleanup/);
});
