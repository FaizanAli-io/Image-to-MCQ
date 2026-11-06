const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { loadModule } = require('./load-module.cjs');
const { buildMappingsWorkbook, getQuestionMarks, parseQuestionId, reconcileMappings } = loadModule('lib/topic-mapper-export.ts', { xlsx: XLSX });
const mapping = id => ({ question_id: id, primary_topic: '1', topic_name: 'Biodiversity', secondary_topic: null, reason: '', needs_review: false, review_reason: null });
const parts = (main, entries) => entries.map(([suffix, marks]) => ({ question_id: `Q${main}${suffix}`, text: 'Source question', source_marks: marks, source_part_ids: entries.map(([s]) => `Q${main}${s}`) }));
const rows = (book, sheet = 'Question Mappings') => XLSX.utils.sheet_to_json(book.Sheets[sheet], { header: 1 });

test('Biodiversity regression: totals, labelled parts and missing mapping rows survive XLSX round trip', () => {
  const qs = [...parts(24, [['(a)(i)', 3], ['(a)(ii)', 3], ['(a)(iii)', 1], ['(b)(i)', 2], ['(b)(ii)', 4]]),
    ...parts(25, [['(i)', 3], ['(ii)', 2], ['(iii)', 3]]), ...parts(51, [['(i)', 2], ['(ii)', 2], ['(iii)', 3]])];
  const book = buildMappingsWorkbook(qs.slice(1).map(q => mapping(q.question_id.replace(/[()]/g, ''))), qs);
  const read = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  assert.deepEqual(rows(read).slice(1).map(r => r.slice(0, 2)), [[24, 13], [25, 8], [51, 7]]);
  assert.deepEqual(rows(read)[1].slice(4, 7), ['a(i)', '', 3]);
  assert.equal(rows(read, 'Detailed Mappings').length, qs.length + 1);
  assert.match(rows(read)[1].at(-1), /mapping missing/);
});

test('missing parts and parent/child overlaps cannot produce a complete total', () => {
  const qs = parts(1, [['(a)', 3], ['(b)', 4]]);
  let book = buildMappingsWorkbook([mapping(qs[0].question_id)], [qs[0]]);
  assert.equal(rows(book)[1][1], '?');
  assert.match(rows(book)[1].at(-1), /Missing source parts/);
  const overlap = parts(1, [['(a)', 5], ['(a)(i)', 2]]);
  book = buildMappingsWorkbook(overlap.map(q => mapping(q.question_id)), overlap);
  assert.equal(rows(book)[1][1], '?');
  assert.match(rows(book)[1].at(-1), /overlap/);
});

test('does not substitute a parent allocation or guess unknown marks', () => {
  assert.equal(getQuestionMarks({ text: 'Context [6 marks]\nLeaf [2 marks]', source_marks: 2 }), 2);
  assert.equal(getQuestionMarks({ text: 'Context [6 marks]\nLeaf [2 marks]', source_marks: null }), null);
  assert.equal(getQuestionMarks({ text: 'Part [3]\nPart [4]' }), null);
  assert.equal(getQuestionMarks({ text: 'Part [3 marks]\nPart [4 marks]' }), null);
  assert.equal(getQuestionMarks({ text: 'Question [3]' }), 3);
});

test('canonical IDs match, compact hierarchy is labelled and review warnings persist', () => {
  assert.deepEqual(parseQuestionId('22aii'), { main: 22, subLabel: 'a(ii)', depth: 2 });
  assert.deepEqual(parseQuestionId('Q22(a)(ii)'), { main: 22, subLabel: 'a(ii)', depth: 2 });
  const qs = [{ question_id: 'Q01(a)(i)', text: 'Question', extraction_review: 'Check unreadable marks.' }];
  const result = reconcileMappings([mapping('1ai')], qs);
  assert.equal(result[0].topic_name, 'Biodiversity');
  assert.equal(result[0].needs_review, true);
  assert.match(result[0].review_reason, /unreadable/);
  assert.equal(rows(buildMappingsWorkbook(result, qs))[1][1], '?');
});

test('legacy inputs expose unverified totals instead of presenting source coverage as checked', () => {
  const qs = [{ question_id: '1.1', text: 'Question [2]' }];
  const book = buildMappingsWorkbook([mapping('1.1')], qs);
  assert.equal(rows(book)[1][1], '2 (unverified)');
  assert.match(rows(book)[1].at(-1), /coverage unverified/);
});
