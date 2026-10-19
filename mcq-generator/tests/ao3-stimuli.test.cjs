const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { sectionFixture, fixture, graph, table, diagram, studentQuestions } = require('./ao3-fixtures.cjs');
const { parseStimulus, validateAO3Result } = loadModule('lib/mini-quiz-stimuli.ts');
const { layoutStimulus } = loadModule('lib/stimulus-layout.ts');

test('shared A-level stimuli resolve without exposing private review fields', async () => {
  const raw = fixture();
  raw.stimuli[0].developerNotes = 'PRIVATE STIMULUS NOTES';
  const { generateMiniQuiz } = loadModule('lib/openai.ts', { openai: class {
    chat = { completions: { create: async payload => ({ choices: [{ message: { content: JSON.stringify(sectionFixture(raw, payload.response_format.json_schema.name.slice(-3))) } }] }) } };
  } });
  const questions = await generateMiniQuiz('test-only', ['https://example.test/a.png'], 'A-LEVEL');
  assert.deepEqual(questions[14].stimuli, questions[15].stimuli);
  assert.equal(questions[14].stimuli[0].kind, 'graph');
  assert.equal(questions[14].requiresStimulus, true);
  assert.deepEqual(questions[14].stimulusIds, ['rates']);
  assert.equal(questions.filter(q => q.aoLevel === 'AO2').length, 6);
  assert.doesNotMatch(JSON.stringify(questions), /PRIVATE|ao3Review|developerNotes/);
});

test('GCSE requires a referenced stimulus even when the text includes a scenario', () => {
  const raw = fixture('GCSE');
  raw.questions[18].requiresStimulus = false;
  raw.questions[18].stimulusIds = [];
  raw.questions[18].text = 'A student samples only three areas near a path. Assess whether this supports a claim about the entire field.';
  raw.questions[18].ao3Review.inlineEvidence = 'Three areas near one path were sampled.';
  raw.stimuli.pop();
  assert.throws(() => validateAO3Result(raw, 'GCSE'), /must use stimulus evidence/);
});

test('nullable optional fields from strict JSON output are accepted and normalized', () => {
  const raw = fixture();
  raw.stimuli[0].categories = null;
  raw.stimuli[0].series.forEach(s => { s.trendPoints = null; s.points.forEach(p => { if (p.yError === undefined) p.yError = null; }); });
  raw.stimuli[2].context = null;
  raw.markScheme.ao3.forEach(m => { m.reasoningToLearn = null; });
  const parsed = validateAO3Result(raw, 'A-LEVEL');
  assert.ok(!('yError' in parsed.stimuli[0].series[0].points[0]));
  assert.ok(!('context' in parsed.stimuli[2]));
  assert.ok(!('reasoningToLearn' in parsed.markScheme[0]));
});

for (const [name, mutate] of [
  ['unknown stimulus', r => { r.questions[14].stimulusIds = ['missing']; }],
  ['duplicate stimulus ID', r => { r.stimuli[1].id = 'rates'; }],
  ['wrong flag', r => { r.questions[14].requiresStimulus = false; }],
  ['A-level diagram', r => { r.stimuli[0] = { ...diagram, id: 'rates' }; }],
  ['A-level missing evidence', r => { r.questions[14].stimulusIds = []; r.questions[14].requiresStimulus = false; }],
  ['invalid awarded marks', r => { r.markScheme.ao3[0].markPoints = ['A point [0]']; }],
  ['duplicate marking entry', r => { r.markScheme.ao3[1].questionNumber = 15; }],
  ['placeholder', r => { r.questions[14].text = '[STIMULUS TO BE INSERTED HERE]'; }],
  ['unexpected AO3 count', r => { r.questions.pop(); }],
  ['AO2 stimulus attachment', r => { r.questions[8].stimulusIds = ['rates']; }],
]) test(`rejects ${name}`, () => { const raw = fixture(); mutate(raw); assert.throws(() => validateAO3Result(raw, 'A-LEVEL'), /correction/); });

for (const [name, mutate] of [
  ['reversed axis', s => { s.xAxis.max = -10; }],
  ['zero tick interval', s => { s.yAxis.tickStep = 0; }],
  ['clipped error bars', s => { s.series[0].points[1].yError = 100; }],
  ['nonfinite point', s => { s.series[0].points[1].y = Infinity; }],
  ['unsorted line points', s => { s.series[0].points.reverse(); }],
  ['unexplained error bars', s => { delete s.errorDescription; }],
  ['unsupported graph type', s => { s.graphType = 'pie'; }],
]) test(`graph validation rejects ${name}`, () => { const s = structuredClone(graph); mutate(s); assert.throws(() => parseStimulus(s, 'GCSE')); });

test('rejects malformed tables and out-of-bounds schematic labels', () => {
  assert.throws(() => parseStimulus({ ...table, rows: [['A']] }, 'GCSE'));
  assert.throws(() => parseStimulus({ ...diagram, elements: [{ type: 'label', x: 590, y: 30, text: 'Outside' }] }, 'GCSE'));
  assert.equal(parseStimulus(diagram, 'GCSE').kind, 'diagram');
});

test('grouped bars preserve categories, zero baseline and error bars', () => {
  const bars = { ...structuredClone(graph), graphType: 'bar', categories: ['A', 'B'], xAxis: { label: 'Condition', units: '', min: -0.5, max: 1.5, tickStep: 1 }, series: [{ name: 'Sample', points: [{ x: 0, y: 20, yError: 2 }, { x: 1, y: 30, yError: 3 }] }] };
  assert.equal(parseStimulus(bars, 'A-LEVEL').graphType, 'bar');
  const labels = layoutStimulus(bars).flatMap(p => p.items).filter(i => i.type === 'text').map(i => i.text);
  assert.ok(labels.includes('A')); assert.ok(labels.includes('B'));
  assert.throws(() => parseStimulus({ ...bars, yAxis: { ...bars.yAxis, min: 10 } }, 'A-LEVEL'));
});

test('AO3 totals are derived from awarded points rather than a repeated model total', () => {
  const raw = fixture();
  raw.questions[14].maxMarks = 4;
  assert.equal(validateAO3Result(raw, 'A-LEVEL').marksByQuestion.get(15), 2);
});

test('repeated references resolve once; duplicate A-level stimuli cannot replace three distinct stimuli', () => {
  const raw = fixture();
  raw.questions[14].stimulusIds = [' rates ', 'rates'];
  assert.deepEqual(validateAO3Result(raw, 'A-LEVEL').idsByQuestion.get(15), ['rates']);
  raw.stimuli[2] = { ...structuredClone(raw.stimuli[0]), id: 'rates-copy' };
  raw.questions[18].stimulusIds = ['rates-copy'];
  raw.questions[19].stimulusIds = ['rates-copy'];
  assert.throws(() => validateAO3Result(raw, 'A-LEVEL'), /3 distinct/);
});

test('zero optional errors do not require an invented explanation; positive errors still do', () => {
  const raw = structuredClone(graph);
  raw.series.forEach(s => s.points.forEach(p => { p.yError = 0; }));
  raw.errorDescription = null;
  const parsed = parseStimulus(raw, 'GCSE');
  assert.ok(parsed.series.every(s => s.points.every(p => p.yError === undefined)));
  raw.series[0].points[1].yError = 2;
  assert.throws(() => parseStimulus(raw, 'GCSE'), /explain what error bars represent/);
});

test('generation schemas constrain taxonomy and require explanations for positive error bars', () => {
  const Ajv = require('ajv');
  const { getMiniQuizSchema } = loadModule('lib/mini-quiz-schema.ts');
  const { AO3_TYPES } = loadModule('lib/ao3-taxonomy.ts');
  for (const level of ['GCSE', 'A-LEVEL']) {
    for (const schema of [getMiniQuizSchema(level)]) {
      const review = schema.properties.questions.items.properties.ao3Review.anyOf[0];
      const validateReview = new Ajv().compile(review);
      for (const type of AO3_TYPES[level]) assert.ok(validateReview({ primaryType: type, evidenceUse: 'Use measurements', inlineEvidence: null }));
      assert.equal(validateReview({ primaryType: 'invented_type', evidenceUse: 'Use measurements', inlineEvidence: null }), false);
      const validateGraph = new Ajv().compile(schema.properties.stimuli.items.anyOf[2]);
      const raw = structuredClone(graph);
      raw.categories = null;
      raw.series.forEach(s => { s.trendPoints = null; s.points.forEach(p => { p.yError ??= null; }); });
      assert.ok(validateGraph(raw), JSON.stringify(validateGraph.errors));
      raw.errorDescription = null;
      assert.equal(validateGraph(raw), false);
      raw.errorDescription = '';
      assert.equal(validateGraph(raw), false);
      raw.errorDescription = null;
      raw.series.forEach(s => s.points.forEach(p => { p.yError = null; }));
      assert.ok(validateGraph(raw), JSON.stringify(validateGraph.errors));
      raw.series[0].points = [];
      assert.equal(validateGraph(raw), false);
    }
  }
});

test('bar data has visible fills, proportional signed heights and explicit real zeros', () => {
  const raw = { ...structuredClone(graph), context: undefined, graphType: 'bar', categories: ['Negative', 'Zero', 'Positive'],
    xAxis: { label: 'Condition', units: '', min: -0.5, max: 2.5, tickStep: 1 },
    yAxis: { label: 'Change', units: 'cm3', min: -20, max: 40, tickStep: 10 },
    series: [{ name: 'Sample', points: [{ x: 0, y: -10 }, { x: 1, y: 0 }, { x: 2, y: 20 }] }], errorDescription: null };
  const items = layoutStimulus(parseStimulus(raw, 'GCSE')).flatMap(p => p.items);
  const bars = items.filter(i => i.type === 'rect' && i.width > 30);
  assert.equal(bars.length, 2);
  assert.ok(bars.every(b => b.fill && b.fill !== '#ffffff' && b.height > 0));
  assert.ok(Math.abs(bars[1].height / bars[0].height - 2) < 0.00001);
  assert.ok(Math.abs(bars[1].y + bars[1].height - bars[0].y) < 0.00001);
  assert.ok(items.some(i => i.type === 'text' && i.text === '0' && i.x > 98));
});

test('PDF draws shared graphs once across page breaks and references their actual page', async () => {
  const { getDocumentProxy } = require('unpdf');
  const { generatePDF } = loadModule('lib/pdf-utils.ts');
  const raw = fixture();
  raw.questions[14].text = 'Use the supplied measurements to evaluate the conclusion. '.repeat(18);
  raw.questions[15].text = 'Compare the observations and evaluate the stated conclusion. '.repeat(20);
  const pdf = await getDocumentProxy(new Uint8Array(generatePDF(studentQuestions(raw)).output('arraybuffer')));
  let firstStimulusPage, graphPage, graphCount = 0, referencePage, text = '';
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await (await pdf.getPage(n)).getTextContent();
    const pageText = items.map(i => i.str).join(' ');
    if (pageText.includes('Stimulus 1: Reaction measurements') && !pageText.includes('Use Stimulus 1:') && firstStimulusPage === undefined) firstStimulusPage = n;
    if (pageText.includes('Volume collected')) { graphPage = n; graphCount++; }
    if (pageText.includes('Use Stimulus 1:')) referencePage = n;
    text += pageText + '\n';
  }
  assert.equal(graphCount, 1);
  assert.ok(referencePage > graphPage, 'fixture must exercise a cross-page shared reference');
  const pages = firstStimulusPage === graphPage ? `page ${graphPage}` : `pages ${firstStimulusPage}-${graphPage}`;
  assert.ok(text.includes(`Use Stimulus 1: Reaction measurements (${pages})`));
});

test('SVG display escapes text and shares stimuli between questions', () => {
  const { renderToStaticMarkup } = require('react-dom/server');
  const Display = loadModule('components/QuestionDisplay.tsx').default;
  const raw = fixture();
  raw.stimuli[0].title = '<script>alert(1)</script>';
  const html = renderToStaticMarkup(Display({ questions: studentQuestions(raw) }));
  assert.equal((html.match(/id="stimulus-rates"/g) || []).length, 1);
  assert.ok(html.includes('href="#stimulus-rates"'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('PRIVATE REVIEW'));
});

test('PDF preserves evidence, units, marks, shared references and page bounds', async () => {
  const { getDocumentProxy } = require('unpdf');
  const { generatePDF } = loadModule('lib/pdf-utils.ts');
  for (const level of ['GCSE', 'A-LEVEL']) {
    const raw = fixture(level);
    raw.stimuli[1].rows = Array.from({ length: 16 }, (_, i) => [`Condition ${i + 1}: repeated controlled observation`, '28', '30', '32']);
    const pdf = await getDocumentProxy(new Uint8Array(generatePDF(studentQuestions(raw)).output('arraybuffer')));
    let text = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber), { items } = await page.getTextContent();
      text += items.map(i => i.str).join(' ') + '\n';
      for (const item of items.filter(i => i.str.trim())) {
        assert.ok(item.transform[5] > 12 && item.transform[5] < page.view[3] - 10, `text outside vertical page bounds: ${item.str}`);
      }
      for (let i = 0; i < items.length; i++) {
        if (/^Q\d+(?: \(\d+ marks\))?$/.test(items[i].str)) {
          const next = items.slice(i + 1).find(x => x.str.includes('First distinct'));
          assert.ok(next && items[i].transform[5] - next.transform[5] >= 16, 'marking point must be below its heading');
        }
      }
    }
    assert.match(text, /Volume collected/);
    assert.match(text, /Time \(s\)/);
    assert.match(text, /standard deviation/);
    assert.match(text, /Condition 16/);
    assert.match(text, level === 'GCSE' ? /Q17 \(2 marks\)/ : /Q15 \(2 marks\)/);
    assert.match(text, /Reasoning to learn/);
    assert.doesNotMatch(text, /PRIVATE REVIEW|STIMULUS TO BE INSERTED/);
  }
});