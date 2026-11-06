const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { readWorksheetQuestions, pageLines } = loadModule('lib/mapper-source.ts');

const item = (text, y, x = 75) => ({ text, y, x, height: 9, width: 100 });
const page = (number, items) => ({ page: number, height: 840, items: [item('PhysicsAndMathsTutor.com', 820), ...items] });

test('reads physical order, keeps cross-page parent stems and original allocations', () => {
  const pages = [page(1, [
    item('22(a). Next parent stem', 600), item('i. First part', 570), item('[2]', 540, 480),
    item('21. Earlier parent stem', 770), item('i. First question', 740), item('[1]', 710, 480),
    item('ii. Second question', 680), item('[1]', 650, 480),
  ]), page(2, [item('ii. Continued part', 770), item('[3]', 740, 480), item('(b). Final part', 710), item('[4]', 680, 480)])];
  const qs = readWorksheetQuestions(pages);
  assert.deepEqual(qs.map(q => q.question_id), ['Q21(i)', 'Q21(ii)', 'Q22(a)(i)', 'Q22(a)(ii)', 'Q22(b)']);
  assert.deepEqual(qs.map(q => q.source_marks), [1, 1, 2, 3, 4]);
  assert.match(qs[3].text, /Next parent stem/);
  assert.doesNotMatch(qs[3].text, /First part/);
  assert.equal(qs[3].source_page, 2);
  assert.deepEqual(qs[3].source_part_ids, ['Q22(a)(i)', 'Q22(a)(ii)', 'Q22(b)']);
});

test('preserves an unmarked part for review, and ignores numbered method instructions', () => {
  const qs = readWorksheetQuestions([page(1, [
    item('24. Parent', 770), item('i. Follow the method', 740),
    item('1. Measure a sample', 710, 115), item('2. Repeat the measurement', 690, 115),
    item('[3]', 660, 480), item('ii. Unreadable allocation', 630),
    item('25. Next question', 590), item('[2]', 550, 480),
  ])]);
  assert.equal(qs.length, 3);
  assert.equal(qs[1].source_marks, null);
  assert.match(qs[1].extraction_review, /readable mark/);
});

test('does not claim a verified inventory for unknown, repeated or gapped numbering', () => {
  assert.equal(readWorksheetQuestions([{ page: 1, height: 840, items: [item('1. Question', 770)] }]), null);
  assert.equal(readWorksheetQuestions([page(1, [item('21. First', 770), item('[2]', 740), item('23. Missing question?', 710), item('[2]', 680)])]), null);
  assert.equal(readWorksheetQuestions([page(1, [item('21. First', 770), item('i. Part', 740), item('[2]', 710), item('i. Duplicate', 680), item('22. Next', 650)])]), null);
  assert.equal(readWorksheetQuestions([page(1, [item('21. Left question [2]', 770), item('22. Right question [3]', 770, 330)])]), null);
});

test('joins table cells in visual order without mutating source items', () => {
  const input = page(1, [item('right', 600, 300), item('left', 600, 80), item('next', 580, 80)]);
  const original = JSON.stringify(input);
  assert.deepEqual(pageLines(input).slice(1).map(l => l.text), ['left right', 'next']);
  assert.equal(JSON.stringify(input), original);
});

test('an inline question asking for a total still has its own mark allocation', () => {
  const qs = readWorksheetQuestions([page(1, [item('21. Calculate the total population. [2]', 770), item('22. Explain your answer. [3]', 730)])]);
  assert.deepEqual(qs.map(q => q.source_marks), [2, 3]);
});
