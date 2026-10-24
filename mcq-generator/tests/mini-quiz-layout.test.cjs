const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getDocumentProxy } = require('unpdf');
const { loadModule } = require('./load-module.cjs');
const { fixture, studentQuestions } = require('./ao3-fixtures.cjs');
const { generatePDF } = loadModule('lib/pdf-utils.ts');

async function readPages(questions) {
  const pdf = await getDocumentProxy(new Uint8Array(generatePDF(questions).output('arraybuffer')));
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const { items } = await page.getTextContent();
    pages.push({ text: items.map(x => x.str).join(' '), items, view: page.view });
  }
  return pages;
}

function quiz(count) {
  const markScheme = { ao1: [], ao2: [], ao3: [] };
  return Array.from({ length: count }, (_, i) => {
    const aoLevel = i < Math.ceil(count / 2) ? 'AO1' : 'AO2';
    markScheme[aoLevel.toLowerCase()].push({ questionNumber: i + 1, markPoints: [`MarkStart${i + 1} complete answer MarkEnd${i + 1} [1]`] });
    return { text: `Start${i + 1} Explain the observation using the supplied information. End${i + 1}`,
      type: 'SHORT_ANSWER', aoLevel, maxMarks: 1, questionNumber: i + 1, topic: 'A topic with its own title', markScheme };
  });
}

test('mini layout adapts to different lengths with complete content and separate accurate page totals', async () => {
  for (const count of [1, 7, 35]) {
    const questions = quiz(count), before = structuredClone(questions);
    const pages = await readPages(questions);
    const start = pages.findIndex(p => p.text.includes('| Mark Scheme'));
    assert.ok(start > 0);
    pages.forEach((p, i) => {
      assert.ok(p.text.includes(`Page ${i < start ? i + 1 : i - start + 1} of ${i < start ? start : pages.length - start}`));
      assert.doesNotMatch(p.text, /Past Paper Pal|Want more questions|HI TUTORING|pastpaperpal\.co/);
    });
    for (let n = 1; n <= count; n++) {
      const questionPage = pages.slice(0, start).filter(p => p.text.includes(`Start${n} `));
      assert.equal(questionPage.length, 1);
      assert.ok(questionPage[0].text.includes(`End${n}`));
      const markPage = pages.slice(start).filter(p => p.text.includes(`MarkStart${n} `));
      assert.equal(markPage.length, 1);
      assert.ok(markPage[0].text.includes(`MarkEnd${n}`));
    }
    assert.deepEqual(questions, before);
  }
});

test('normal long questions and mark entries move together to a fresh page', async () => {
  const questions = quiz(24);
  questions[17].text = 'KeepStart ' + 'Apply the supplied information to explain this observation. '.repeat(12) + 'KeepEnd';
  questions[0].markScheme.ao2[5].markPoints = ['MarkKeepStart ' + 'A complete explanation linked to the evidence. '.repeat(12) + 'MarkKeepEnd [1]'];
  const pages = await readPages(questions);
  for (const [start, end] of [['KeepStart', 'KeepEnd'], ['MarkKeepStart', 'MarkKeepEnd']]) {
    const found = pages.filter(p => new RegExp(`\\b${start}\\b`).test(p.text));
    assert.equal(found.length, 1);
    assert.ok(found[0].text.includes(end), `${start} should not be split`);
  }
  for (const p of pages) {
    const content = p.items.filter(i => i.str.trim() && i.transform[5] > 45 && i.transform[5] < 780);
    assert.ok(content.length > 1, 'no page with only an orphaned section heading');
  }
});

test('oversized question and mark scheme continue without losing text or crossing page bounds', async () => {
  const questions = quiz(1);
  questions[0].text = 'LongQuestionStart ' + 'A lengthy scientific scenario with observations and measurements. '.repeat(180) + 'LongQuestionEnd';
  questions[0].markScheme.ao1[0].markPoints = ['LongMarkStart ' + 'Detailed explanation supporting the evidence. '.repeat(190) + 'LongMarkEnd [1]'];
  const pages = await readPages(questions);
  const text = pages.map(p => p.text).join(' ');
  assert.match(text, /LongQuestionStart/); assert.match(text, /LongQuestionEnd/);
  assert.match(text, /LongMarkStart/); assert.match(text, /LongMarkEnd/);
  assert.match(text, /\(continued\)/); assert.match(text, /cont\./);
  for (const p of pages) for (const item of p.items.filter(i => i.str.trim())) {
    assert.ok(item.transform[5] > 12 && item.transform[5] < p.view[3] - 10, item.str);
    assert.ok(item.transform[4] >= 35 && item.transform[4] + item.width < p.view[2] - 25, item.str);
  }
});

test('multiple choice, true/false and long-answer text retain their content in mini PDFs', async () => {
  const questions = quiz(3);
  questions[0].type = 'MULTIPLE_CHOICE';
  questions[0].options = ['OptionAlpha', 'OptionBeta', 'OptionGamma', 'OptionDelta'];
  questions[1].type = 'TRUE_FALSE';
  questions[2].type = 'LONG_ANSWER';
  const text = (await readPages(questions)).map(p => p.text).join(' ');
  for (const value of ['A) OptionAlpha', 'D) OptionDelta', 'True / False', 'Start3']) assert.ok(text.includes(value));
});

test('dense tables paginate with every row preserved and no footer overlap', async () => {
  const raw = fixture('A-LEVEL');
  raw.stimuli[1].columns = ['Condition and method', 'Measurement one', 'Measurement two', 'Measurement three'];
  raw.stimuli[1].rows = Array.from({ length: 16 }, (_, i) => [`UniqueRow${i + 1} ` + 'repeated controlled observation '.repeat(4), '12.5', '18.4', '21.8']);
  const pages = await readPages(studentQuestions(raw));
  const text = pages.map(p => p.text).join(' ');
  for (let i = 1; i <= 16; i++) assert.ok(text.includes(`UniqueRow${i} `));
  for (const p of pages) for (const item of p.items.filter(i => i.str.trim())) {
    assert.ok(item.transform[5] > 12 && item.transform[5] < p.view[3] - 10, item.str);
  }
});
