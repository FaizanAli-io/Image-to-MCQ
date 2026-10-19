const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { graph, fixture, sectionFixture } = require('./ao3-fixtures.cjs');
const { normalizeMiniQuizStimulus } = loadModule('lib/mini-quiz-normalize.ts');
const { parseStimulus } = loadModule('lib/mini-quiz-stimuli.ts');

test('graph display arithmetic is corrected without changing observations or error bars', () => {
  for (const mutate of [
    g => { g.yAxis.max = 33; g.yAxis.tickStep = 10; },
    g => { g.series[0].points[4].yError = 25; },
    g => { g.yAxis.tickStep = 0; },
    g => { g.xAxis.tickStep = 0.001; },
  ]) {
    const input = structuredClone(graph);
    mutate(input);
    const before = structuredClone(input);
    const normalized = normalizeMiniQuizStimulus(input);
    assert.doesNotThrow(() => parseStimulus(normalized, 'A-LEVEL'));
    assert.deepEqual(normalized.series, input.series);
    assert.equal(normalized.errorDescription, input.errorDescription);
    assert.deepEqual(input, before, 'does not mutate source data');
  }
  assert.deepEqual(normalizeMiniQuizStimulus(graph), graph, 'valid scales are unchanged');
});

test('normalization cannot hide missing uncertainty meaning or invalid measurements', () => {
  for (const mutate of [
    g => { g.errorDescription = null; },
    g => { g.series[0].points[0].y = 'unknown'; },
    g => { g.series[0].points[0].yError = -1; },
    g => { g.yAxis.max = -10; },
    g => { g.series[0].points.reverse(); },
  ]) {
    const input = structuredClone(graph);
    mutate(input);
    assert.throws(() => parseStimulus(normalizeMiniQuizStimulus(input), 'A-LEVEL'));
  }
});

test('A-level generation accepts recoverable scale and single-response metadata without extra AI calls', async () => {
  const raw = fixture();
  raw.stimuli[0].yAxis.max = 33;
  raw.questions[8].text = 'Explain one reason for controlling temperature.';
  raw.questions[8].requestedResponses = null;
  raw.markScheme.ao2[0].responseGroups = [];
  let calls = 0;
  const { generateMiniQuiz } = loadModule('lib/openai.ts', { openai: class {
    chat = { completions: { create: async payload => {
      calls++;
      return { choices: [{ message: { content: JSON.stringify(sectionFixture(raw, payload.response_format.json_schema.name.slice(-3))) } }] };
    } } };
  } });
  const questions = await generateMiniQuiz('test-only', ['https://example.test/source.png'], 'A-LEVEL');
  assert.equal(calls, 3);
  assert.equal(questions.length, 20);
  assert.equal(questions[8].maxMarks, 2);
  assert.deepEqual(questions[14].stimuli[0].series, raw.stimuli[0].series);
  assert.deepEqual(questions[14].stimuli, questions[15].stimuli);
});

test('schema prevents incompatible graph fields and malformed marking points during generation', () => {
  const Ajv = require('ajv');
  const { getMiniQuizSectionSchema } = loadModule('lib/mini-quiz-schema.ts');
  const schema = getMiniQuizSectionSchema('A-LEVEL', 'ao3');
  const validateGraph = new Ajv().compile(schema.properties.stimuli.items.anyOf[2]);
  const input = structuredClone(graph);
  input.categories = null;
  input.series.forEach(s => { s.trendPoints = null; s.points.forEach(p => { p.yError ??= null; }); });
  assert.ok(validateGraph(input));
  input.series[0].trendPoints = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  assert.equal(validateGraph(input), false);
  input.series[0].trendPoints = null;
  input.graphType = 'bar';
  assert.equal(validateGraph(input), false, 'bar categories cannot be null');
  const validateMarks = new Ajv().compile(schema.properties.markScheme.items.properties.markPoints);
  assert.ok(validateMarks(['Uses the evidence [1]']));
  assert.equal(validateMarks(['Uses the evidence [2]']), false);
  assert.equal(validateMarks([]), false);
});

test('validation errors identify the failed check without exposing arbitrary exception details', () => {
  const { MiniQuizEvidenceError } = loadModule('lib/mini-quiz-errors.ts');
  assert.match(new MiniQuizEvidenceError(new Error('Q9: marking groups must match the 2 requested responses')).message, /Q9: marking groups/);
  assert.doesNotMatch(new MiniQuizEvidenceError(new Error('secret network URL')).message, /secret network/);
});

test('AO1 any-two alternatives retain a two-mark cap and explicit guidance in the exported PDF', async () => {
  const raw = fixture();
  raw.questions[6].text = 'Name two features of alveoli that make them efficient for gas exchange.';
  raw.questions[6].requestedResponses = 2;
  raw.markScheme.ao1[6].markPoints = ['Large surface area [1]', 'Thin walls [1]', 'Good blood supply [1]', 'Many alveoli [1]'];
  raw.markScheme.ao1[6].responseGroups = [[1], [2]];
  const { generateMiniQuiz } = loadModule('lib/openai.ts', { openai: class {
    chat = { completions: { create: async payload => ({ choices: [{ message: {
      content: JSON.stringify(sectionFixture(raw, payload.response_format.json_schema.name.slice(-3))),
    } }] }) } };
  } });
  const questions = await generateMiniQuiz('test-only', ['image'], 'A-LEVEL');
  assert.equal(questions[6].maxMarks, 2);
  const entry = questions[6].markScheme.ao1[6];
  assert.equal(entry.markPoints.length, 4);
  assert.match(entry.markingGuidance, /up to 2 marks/);
  const { generatePDF } = loadModule('lib/pdf-utils.ts');
  const { getDocumentProxy, extractText } = require('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(generatePDF(questions).output('arraybuffer')));
  const { text } = await extractText(pdf, { mergePages: true });
  assert.match(text, /Q7 \(2 marks\)/);
  assert.match(text, /Accept any 2/);
});
