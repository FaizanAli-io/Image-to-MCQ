// Manual live check: start npm run dev, then run node tests/topic-mapper-large-live.cjs.
// Calls the local API with generated PDFs and uses the server's real AI credentials.
const assert = require('node:assert/strict');
const { jsPDF } = require('jspdf');

function pdf(kind) {
  const doc = new jsPDF();
  doc.setFontSize(10);
  let y = 15;
  function add(text) {
    for (const line of doc.splitTextToSize(text, 175)) {
      if (y > 280) { doc.addPage(); y = 15; }
      doc.text(line, 15, y);
      y += 5;
    }
  }
  add(kind === 'paper'
    ? 'Question 1(a): Explain why solid sodium chloride does not conduct electricity. (1 mark)'
    : '1(a): The ions are fixed in position and cannot move to carry charge. (1 mark)');
  for (let i = 0; i < 650; i++) {
    add('Reference note: This is supporting document text, not an exam question or an answer. Read the assessment instructions carefully.');
  }
  add(kind === 'paper'
    ? 'Question 2(a): State the name of the gas produced when magnesium reacts with hydrochloric acid. (1 mark)'
    : '2(a): Hydrogen. Accept hydrogen gas. (1 mark)');
  return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
}

(async () => {
  const data = new FormData();
  data.append('pastPaper', pdf('paper'), 'large-local-paper.pdf');
  data.append('markScheme', pdf('marks'), 'large-local-marks.pdf');
  const response = await fetch('http://localhost:3000/api/extract-questions', {
    method: 'POST', body: data, signal: AbortSignal.timeout(240000),
  });
  const body = await response.json();
  console.log(JSON.stringify({ status: response.status, version: response.headers.get('x-extraction-version'), ...body }, null, 2));
  assert.equal(response.status, 200);
  assert.equal(body.count, 2);
  assert.ok(body.metadata.pastPaperLength + body.metadata.markSchemeLength > 90000);
  assert.ok(body.questions.every(q => !q.mark_scheme.includes('manual review')));
  assert.match(body.questions.find(q => q.question_id === 'Q2a').mark_scheme, /hydrogen/i);
})().catch(error => { console.error(error); process.exitCode = 1; });
