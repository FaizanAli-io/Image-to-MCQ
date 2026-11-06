const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const { readWorksheetMarkScheme } = loadModule('lib/mapper-mark-scheme.ts');
const { matchSourceMarkingRows } = loadModule('lib/mapper-source-extraction.ts');
const item = (text, x, y = 600) => ({ text, x, y, height: 9, width: 60 });
const page = (number, items) => ({ page: number, height: 842, items: [item('PhysicsAndMathsTutor.com', 300, 810), ...items] });
const q = (id, marks = 2) => ({ question_id: id, text: `Original ${id}`, source_marks: marks, source_page: 1, source_part_ids: [id] });

test('joins vertically wrapped identifiers and preserves cross-page marking criteria', () => {
  const rows = readWorksheetMarkScheme([page(1, [
    item('2', 77), item('1', 77, 587), item('i', 102, 593),
    item('Exact original answer', 115), item('ALLOW alternative', 370),
    item('i', 102, 500), item('i', 102, 487), item('Second answer', 115),
  ]), page(2, [item('Continued marking guidance', 370), item('2', 77), item('2', 77), item('a', 91), item('i', 102), item('Next answer', 115)])]);
  assert.deepEqual(rows.map(row => row.question_id), ['Q21(i)', 'Q21(ii)', 'Q22(a)(i)']);
  assert.match(rows[0].content, /ALLOW alternative/);
  assert.match(rows[1].content, /Continued marking guidance/);
  assert.doesNotMatch(rows[1].content, /Next answer/);
});

test('ambiguous tables fall back instead of asserting false row matches', () => {
  assert.equal(readWorksheetMarkScheme([page(1, [item('2', 77), item('1', 77), item('Answer', 115), item('2', 77), item('3', 77), item('Answer', 115)])]), null);
  assert.equal(readWorksheetMarkScheme([{ page: 1, height: 842, items: [item('Unknown format', 20)] }]), null);
});

test('matching structures copy exact source answers with no AI requests', async () => {
  const client = { chat: { completions: { create: () => { throw new Error('Unexpected API request'); } } } };
  const rows = [{ question_id: '21i', content: 'Exact source answer. ALLOW alternative.' }];
  const result = await matchSourceMarkingRows(client, [q('Q21(i)')], rows);
  assert.equal(result[0].mark_scheme, rows[0].content);
  assert.equal(result[0].source_marks, 2);
  assert.equal(result[0].extraction_review, undefined);
});

test('shifted numbering is matched within its main question and never rewrites answers', async () => {
  const questions = [q('Q26(a)', null), q('Q26(b)(i)'), q('Q26(c)')];
  const rows = [{ question_id: 'Q26(a)(i)', content: 'Exact calculation answer' }, { question_id: 'Q26(b)', content: 'Exact graph criteria' }, { question_id: 'Q27(i)', content: 'Unrelated answer' }];
  let calls = 0;
  const client = { chat: { completions: { create: async (args, options) => {
    calls++;
    assert.equal(options.maxRetries, 0);
    assert.doesNotMatch(args.messages[1].content, /Unrelated answer/);
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ matches: [
      { question_id: 'Q26(a)', marking_row_id: null },
      { question_id: 'Q26(b)(i)', marking_row_id: 'Q26(a)(i)' },
      { question_id: 'Q26(c)', marking_row_id: 'Q26(b)' },
    ] }) } }] };
  } } } };
  const result = await matchSourceMarkingRows(client, questions, rows);
  assert.equal(calls, 1);
  assert.equal(result[1].mark_scheme, rows[0].content);
  assert.equal(result[2].mark_scheme, rows[1].content);
  assert.match(result[1].extraction_review, /numbering differ/);
  assert.match(result[0].mark_scheme, /not matched/);
});

for (const failure of ['missing', 'duplicate', 'foreign-row', 'timeout']) {
  test(`${failure} cannot silently mispair answers or discard source questions`, async () => {
    const client = { chat: { completions: { create: async () => {
      if (failure === 'timeout') throw new Error('Request timed out');
      return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ matches: failure === 'missing' ? [] : [
        { question_id: 'Q26(b)', marking_row_id: failure === 'foreign-row' ? 'Q25(a)' : 'Q26(a)' },
        { question_id: failure === 'duplicate' ? 'Q26(b)' : 'Q26(c)', marking_row_id: 'Q26(a)' },
      ] }) } }] };
    } } } };
    const result = await matchSourceMarkingRows(client, [q('Q26(b)'), q('Q26(c)')], [{ question_id: 'Q26(a)', content: 'Answer' }]);
    assert.equal(result.length, 2);
    assert.ok(result.every(q => /not matched/.test(q.mark_scheme) && q.source_marks === 2));
  });
}
