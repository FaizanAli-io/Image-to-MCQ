const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadModule } = require('./load-module.cjs');
const { fixture, studentQuestions } = require('./ao3-fixtures.cjs');
const { reconcileMiniQuizMarks } = loadModule('lib/mini-quiz-marks.ts');
const { validateAO3Result } = loadModule('lib/mini-quiz-stimuli.ts');

test('two variables and their explanations award two response groups, never three', () => {
  const raw = fixture();
  raw.questions[8].text = 'Identify two variables and explain why each should be controlled.';
  raw.questions[8].requestedResponses = 2;
  const entry = raw.markScheme.ao2[0];
  entry.markPoints = ['Temperature [1]', 'Temperature explanation [1]', 'pH [1]', 'pH explanation [1]'];
  entry.responseGroups = [[1, 2], [3, 4]];
  reconcileMiniQuizMarks(raw, 'A-LEVEL');
  assert.equal(raw.questions[8].maxMarks, 4);
  entry.markPoints.push('Concentration [1]', 'Concentration explanation [1]');
  entry.responseGroups.push([5, 6]);
  assert.throws(() => reconcileMiniQuizMarks(raw, 'A-LEVEL'), /2 requested responses/);
  raw.questions[8].requestedResponses = 3;
  assert.throws(() => reconcileMiniQuizMarks(raw, 'A-LEVEL'), /contradicts question wording/);
});

test('response groups cannot omit or award a point twice', () => {
  const raw = fixture();
  raw.questions[8].text = 'State two variables.';
  raw.questions[8].requestedResponses = 2;
  raw.markScheme.ao2[0].responseGroups = [[1], [1]];
  assert.throws(() => reconcileMiniQuizMarks(raw, 'A-LEVEL'), /exactly one/);
});

test('GCSE conceptual AO3 cannot use an unreferenced changed-condition scenario', () => {
  const raw = fixture('GCSE');
  raw.questions[16].text = 'Predict what happens to the equilibrium when temperature increases.';
  raw.questions[16].stimulusIds = [];
  raw.questions[16].requiresStimulus = false;
  assert.throws(() => validateAO3Result(raw, 'GCSE'), /must use stimulus evidence/);
});

test('A-level AO3 rejects repeated interpret/explain pairs and accepts varied reasoning', () => {
  const raw = fixture();
  assert.doesNotThrow(() => validateAO3Result(raw, 'A-LEVEL'));
  raw.questions.slice(14).forEach((q, i) => { q.ao3Review.primaryType = i % 2 ? 'explain_evidence' : 'interpret_evidence'; });
  assert.throws(() => validateAO3Result(raw, 'A-LEVEL'), /at least 3 reasoning types/);
});

test('feedback rules establish enzyme conditions without assuming a universal optimum', () => {
  const { MINI_QUIZ_CLIENT_REQUIREMENTS: rules } = loadModule('lib/mini-quiz-client-requirements.ts');
  assert.match(rules, /below, near or above the optimum/);
  assert.match(rules, /Do not invent an optimum/);
  assert.match(rules, /insufficient information/);
});

test('scientific notation preserves formulae, multi-digit exponents and unit signs', () => {
  const { scientificText } = loadModule('lib/scientific-text.ts');
  assert.equal(scientificText('N2 + 3H2 ⇌ 2NH3'), 'N₂ + 3H₂ ⇌ 2NH₃');
  assert.equal(scientificText('H2SO4; CO2; cm^3 s^{-1}; 10^{-12} μm'), 'H₂SO₄; CO₂; cm³ s⁻¹; 10⁻¹² µm');
  assert.equal(scientificText(String.raw`\ce{N_2 + 3H_2 <=> 2NH_3}`), 'N₂ + 3H₂ ⇌ 2NH₃');
  assert.equal(scientificText('AO1 Q13 pH 7 Fe3+'), 'AO1 Q13 pH 7 Fe³⁺');
});

test('mini PDF filenames follow the topic and stored education level', () => {
  const { miniQuizFilename } = loadModule('lib/mini-quiz-export.ts');
  assert.equal(miniQuizFilename([{ topic: 'Osmosis', educationLevel: 'GCSE' }]), 'Osmosis - GCSE - Mini Quiz.pdf');
  assert.equal(miniQuizFilename([{ topic: 'Enzymes', educationLevel: 'A-LEVEL' }]), 'Enzymes - A-LEVEL - Mini Quiz.pdf');
  assert.equal(miniQuizFilename([{ topic: 'Rates / Enzymes', educationLevel: 'A-LEVEL' }]), 'Rates - Enzymes - A-LEVEL - Mini Quiz.pdf');
});

test('browser export loads the three actual AO assets and fails clearly for missing images', async () => {
  const previous = global.fetch;
  const calls = [];
  const { loadMiniQuizImages } = loadModule('lib/mini-quiz-export.ts');
  try {
    global.fetch = async url => { calls.push(url); return { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer }; };
    assert.deepEqual(Object.keys(await loadMiniQuizImages()), ['ao1', 'ao2', 'ao3']);
    assert.deepEqual(calls, ['/data/AO1.png', '/data/AO2.png', '/data/AO3.png']);
    global.fetch = async () => ({ ok: false });
    await assert.rejects(loadMiniQuizImages(), /Could not load AO1/);
  } finally { global.fetch = previous; }
});

test('real AO assets sit beside their mark-scheme headings, with no intersecting text', async () => {
  const { getDocumentProxy } = require('unpdf');
  const { generatePDF } = loadModule('lib/pdf-utils.ts');
  const images = Object.fromEntries(['ao1', 'ao2', 'ao3'].map(key => [key, new Uint8Array(fs.readFileSync(path.join(__dirname, '../public/data', key.toUpperCase() + '.png')))]));
  const raw = fixture();
  raw.topicName = 'Equilibrium and enzymes';
  for (const entries of Object.values(raw.markScheme)) for (const entry of entries) entry.markPoints[0] = 'Uses the measurements from the investigation to compare the two conditions and supports the conclusion with the specific values supplied, without assuming additional variables or a biological mechanism that has not been established. [1]';
  raw.questions[8].text = 'N2 + 3H2 ⇌ 2NH3. Compare rates in cm³ s⁻¹ at 20°C and 25°C below the supplied optimum.';
  const questions = studentQuestions(raw);
  const doc = generatePDF(questions, undefined, { educationLevel: 'A-LEVEL', images });
  const pdf = await getDocumentProxy(new Uint8Array(doc.output('arraybuffer')));
  let imageCount = 0, markSchemeStarted = false, section = 0, expandedLines = 0;
  const mm = 72 / 25.4;
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { items } = await page.getTextContent();
    const text = items.map(i => i.str).join(' ');
    if (text.includes('Student-Friendly Mark Scheme')) markSchemeStarted = true;
    const ops = await page.getOperatorList();
    // PDF.js OPS.paintImageXObject = 85.
    imageCount += ops.fnArray.filter(op => op === 85).length;
    if (!markSchemeStarted) continue;
    for (const key of ['AO1', 'AO2', 'AO3']) {
      const heading = items.find(i => i.str.startsWith(key + ' '));
      if (!heading) continue;
      section++;
      const bytes = images[key.toLowerCase()];
      const properties = doc.getImageProperties(bytes);
      const imageHeight = 55 * properties.height / properties.width * mm;
      const top = heading.transform[5] + 4 * mm, bottom = top - imageHeight;
      const imageLeft = (210 - 20 - 55) * mm;
      for (const item of items.filter(i => i.str.trim())) {
        if (item.transform[5] > bottom && item.transform[5] <= top) {
          assert.ok(item.transform[4] + item.width < imageLeft - 2 * mm, `Image overlap: ${item.str}`);
        } else if (item.transform[5] < bottom && item.transform[4] + item.width > imageLeft) expandedLines++;
      }
    }
    for (const item of items.filter(i => i.str.trim())) assert.ok(item.transform[5] > 12 && item.transform[5] < page.view[3] - 10, item.str);
  }
  assert.equal(imageCount, 3);
  assert.equal(section, 3);
  assert.ok(expandedLines > 0, 'text should return to full width below images');
});
