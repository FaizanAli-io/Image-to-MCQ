const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { fixture, studentQuestions, sectionFixture } = require('./ao3-fixtures.cjs');

test('one requested answer normalizes all redundant grouping variants across sections and levels', () => {
  const { reconcileMiniQuizMarks } = loadModule('lib/mini-quiz-marks.ts');
  for (const level of ['GCSE', 'A-LEVEL']) for (const section of ['ao1', 'ao2', 'ao3']) {
    for (const groups of [undefined, [], [[]], [[1], [2]], [[1, 1]], [[2]], [[0, 3]]]) {
      const raw = fixture(level);
      const entry = raw.markScheme[section][0];
      const question = raw.questions[entry.questionNumber - 1];
      question.text = 'Explain one reason for this observation.';
      question.requestedResponses = 1;
      entry.responseGroups = groups;
      const points = [...entry.markPoints];
      reconcileMiniQuizMarks(raw, level);
      assert.equal(question.maxMarks, 2);
      assert.deepEqual(entry.responseGroups, [[1, 2]]);
      assert.deepEqual(entry.markPoints, points);
    }
  }
});

test('reported Q5 split-group error completes generation without another model call', async () => {
  const raw = fixture();
  raw.questions[4].text = 'Explain one function of the membrane.';
  raw.questions[4].requestedResponses = 1;
  raw.markScheme.ao1[4].responseGroups = [[1], [2]];
  let calls = 0;
  const { generateMiniQuiz } = loadModule('lib/openai.ts', { openai: class {
    chat = { completions: { create: async payload => {
      calls++;
      return { choices: [{ message: { content: JSON.stringify(sectionFixture(raw, payload.response_format.json_schema.name.slice(-3))) } }] };
    } } };
  } });
  const questions = await generateMiniQuiz('test', ['image'], 'A-LEVEL');
  assert.equal(questions.length, 20);
  assert.equal(calls, 3);
  assert.equal(questions[4].maxMarks, 2);
});

test('student mark annotation removal preserves scientific brackets and numeric observations', () => {
  const { miniQuizQuestionText } = loadModule('lib/mini-quiz-presentation.ts');
  assert.equal(miniQuizQuestionText('Compare [Na+] at 2 seconds. [2 marks]'), 'Compare [Na+] at 2 seconds.');
  assert.equal(miniQuizQuestionText('Explain this. [2]'), 'Explain this.');
  assert.equal(miniQuizQuestionText('Use values [2, 4] to compare.'), 'Use values [2, 4] to compare.');
});

test('website gives every AO3 question numbered references and draws each boxed stimulus once', () => {
  const { renderToStaticMarkup } = require('react-dom/server');
  const Display = loadModule('components/QuestionDisplay.tsx').default;
  const raw = fixture();
  raw.questions[0].text += ' [2 marks]';
  const html = renderToStaticMarkup(Display({ questions: studentQuestions(raw) }));
  assert.equal((html.match(/<figure /g) || []).length, 3);
  assert.equal((html.match(/Refer to /g) || []).length, 6);
  for (const n of [1, 2, 3]) assert.ok(html.includes(`Stimulus ${n}:`));
  assert.match(html, /border-2 border-gray-600/);
  assert.doesNotMatch(html, /\[2 marks\]|bg-amber-100/);
});

test('PDF removes student marks, retains marking totals and labels boxed shared evidence', async () => {
  const { getDocumentProxy } = require('unpdf');
  const { generatePDF } = loadModule('lib/pdf-utils.ts');
  for (const level of ['GCSE', 'A-LEVEL']) {
    const raw = fixture(level);
    raw.questions.forEach(q => { q.text += ' [2 marks]'; });
    const pdf = await getDocumentProxy(new Uint8Array(generatePDF(studentQuestions(raw)).output('arraybuffer')));
    let studentText = '', markingText = '', inMarks = false;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const { items } = await page.getTextContent();
      const text = items.map(item => item.str).join(' ');
      if (text.includes('Mark Scheme')) inMarks = true;
      if (inMarks) markingText += text;
      else studentText += text;
      for (const item of items.filter(i => i.str.trim())) assert.ok(item.transform[5] > 12 && item.transform[5] < page.view[3] - 10, item.str);
    }
    assert.doesNotMatch(studentText, /\[\d+ marks?\]/);
    assert.match(markingText, /Q1\s+2 marks/);
    for (const n of [1, 2, 3]) {
      assert.ok(studentText.includes(`Stimulus ${n}:`));
      assert.ok(studentText.includes(`Stimulus ${n}:`), 'stimulus number is present beside its question or in its reference');
    }
  }
});
