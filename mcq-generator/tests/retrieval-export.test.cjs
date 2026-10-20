const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');

const questions = Array.from({ length: 30 }, (_, i) => ({
  text: `Retrieval question ${i + 1}: select the matching observation.`,
  type: 'MULTIPLE_CHOICE',
  topic: ['Topic A: Cells', 'Topic B: Osmosis', 'Topic C: Enzymes'][Math.floor(i / 10)],
  options: ['First observation', 'Second observation', 'Third observation', 'Fourth observation'],
  correctAnswer: i % 4,
}));

test('retrieval filename includes all topic names, level and quiz type', () => {
  const { retrievalQuizFilename } = loadModule('lib/retrieval-export.ts');
  assert.equal(retrievalQuizFilename(questions, 'GCSE'), 'Cells, Osmosis, Enzymes - GCSE - Retrieval Quiz.pdf');
  const long = retrievalQuizFilename([{ topic: 'Topic A: ' + 'A/B?'.repeat(100) }], 'A-LEVEL');
  assert.ok(long.endsWith(' - A-LEVEL - Retrieval Quiz.pdf'));
  assert.ok(long.length <= 184);
  assert.doesNotMatch(long, /[<>:"/\\|?*]/);
});

test('combined retrieval export preserves every question and answer page in order', async () => {
  const { getDocumentProxy } = require('unpdf');
  const { generatePDF, generateAnswerKey, generateRetrievalPDF } = loadModule('lib/pdf-utils.ts');
  async function pages(doc) {
    const pdf = await getDocumentProxy(new Uint8Array(doc.output('arraybuffer')));
    const result = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const { items } = await (await pdf.getPage(i)).getTextContent();
      result.push(items.map(item => item.str).join(' '));
    }
    return result;
  }
  const before = structuredClone(questions);
  const questionPages = await pages(generatePDF(questions, 'GCSE retrieval Quiz'));
  const answerPages = await pages(generateAnswerKey(questions));
  const combined = await pages(generateRetrievalPDF(questions, 'GCSE retrieval Quiz'));
  assert.deepEqual(combined, [...questionPages, ...answerPages]);
  assert.ok(combined[questionPages.length].includes('Answer Key'));
  assert.deepEqual(questions, before);
});
