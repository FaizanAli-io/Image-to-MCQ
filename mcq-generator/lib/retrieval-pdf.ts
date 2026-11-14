import jsPDF from 'jspdf';
import type { GeneratedQuestion } from './types';
import { MINI_QUIZ_QR, MINI_QUIZ_URL } from './mini-quiz-brand';
import { drawScientificLine, takeScientificLine } from './scientific-pdf';

const NAVY = '#080E50', GREEN = '#285B16', BLUE = '#EAF4FA';
const PERIODS = ['Last week', '2–3 weeks ago', '4+ weeks ago'];

/** Presentation only: option order and correctAnswer are consumed without mutation. */
export function retrievalPDF(questions: GeneratedQuestion[], mode: 'quiz' | 'answers' | 'combined'): jsPDF {
  const doc = new jsPDF();
  const kinds: string[] = [];
  let y = 0;
  const lines = (text: string, width: number, size: number, bold = false) => {
    const result: string[] = [];
    let rest = text;
    while (rest) { const [line, next] = takeScientificLine(doc, rest, width, size, bold); result.push(line); rest = next; }
    return result;
  };
  const text = (value: string, x: number, baseline: number, size: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.text(value, x, baseline);
  };
  function page(kind: string) {
    if (kinds.length) doc.addPage();
    kinds.push(kind);
    doc.setDrawColor('#E3EDF4'); doc.roundedRect(3, 2, 204, 291, 5, 5);
    doc.setTextColor(NAVY); text('Past Paper Pal', 11, 15, 25, true);
    doc.setDrawColor('#329548'); doc.setLineWidth(0.8); doc.line(11, 18, 82, 18);
    text('R E V I S I O N  T O O L S  ·  B Y  H I  T U T O R I N G', 11, 24, 6.6, true);
    doc.setFillColor('#F0F7FA'); doc.roundedRect(130, 5, 70, 23, 3, 3, 'F');
    const cell = 21 / MINI_QUIZ_QR.length;
    doc.setFillColor('#000000'); MINI_QUIZ_QR.forEach((row, r) => [...row].forEach((v, c) => { if (v === '1') doc.rect(131 + c * cell, 6 + r * cell, cell, cell, 'F'); }));
    text('Want more questions', 153, 10, 7.4, true); text('like these?', 153, 13, 7.4, true);
    text('Turn your revision notes', 153, 17, 6.3); text('into your own quiz:', 153, 20, 6.3);
    doc.setTextColor(GREEN); text('quizgenerator.pastpaperpal.co.uk', 153, 24, 5.8);
    doc.link(130, 5, 70, 23, { url: MINI_QUIZ_URL });
    doc.setDrawColor(NAVY); doc.setLineWidth(0.35); doc.line(10, 31, 200, 31);
    doc.setTextColor(NAVY); text(kind, 10, 45, 27, true); y = 52;
  }
  function heading(group: number, topic: string, continued = false) {
    const title = lines(topic + (continued ? ' (continued)' : ''), 130, 12, true);
    const h = Math.max(13, title.length * 5 + 4);
    doc.setFillColor('#D5E5FC'); doc.roundedRect(11, y + 1, 51, 9, 2.5, 2.5, 'F');
    doc.setTextColor(NAVY); text(PERIODS[group % 3], 14, y + 7, 11, true);
    doc.setDrawColor(NAVY); doc.line(66, y + 1, 66, y + h - 3);
    doc.setTextColor(GREEN); title.forEach((line, i) => drawScientificLine(doc, line, 71, y + 6 + i * 5, 12, true));
    y += h + 3;
  }
  if (mode !== 'answers') {
    page('Retrieval Quiz');
    questions.forEach((q, index) => {
      const group = Math.floor(index / 10);
      const topic = q.topic || `Topic ${'ABC'[group % 3]}`;
      if (index % 10 === 0) { if (index) page('Retrieval Quiz'); heading(group, topic); }
      const rows = [ ...lines(q.text, 169, 10, true).map(value => ({ value, bold: true })),
        ...(q.options || []).flatMap((option, i) => lines(`${'ABCD'[i]}) ${option}`, 169, 9.5).map(value => ({ value, bold: false }))) ];
      const height = rows.length * 3.2 + 3;
      if (y + height > 277 && y > 75) { page('Retrieval Quiz'); heading(group, topic, true); }
      let offset = 0;
      while (offset < rows.length) {
        const count = Math.min(rows.length - offset, Math.max(1, Math.floor((277 - y - 3) / 3.2)));
        doc.setFillColor(BLUE); doc.roundedRect(8, y, 194, count * 3.2 + 3, 3, 3, 'F');
        doc.setFillColor('#D5EAF7'); doc.roundedRect(10, y + 2, 11, 6, 2, 2, 'F');
        doc.setTextColor(NAVY); text(String(index + 1), 15.5, y + 6.5, 10, true);
        rows.slice(offset, offset + count).forEach((row, i) => drawScientificLine(doc, row.value, 26, y + 4 + i * 3.2, row.bold ? 10 : 9.5, row.bold));
        offset += count; y += count * 3.2 + 4;
        if (offset < rows.length) { page('Retrieval Quiz'); heading(group, topic, true); }
      }
    });
  }
  if (mode !== 'quiz') {
    page('Answer Key'); text('Retrieval Quiz', 11, 53, 14); y = 59;
    doc.setFillColor('#DFEFC5'); doc.roundedRect(8, y, 194, 14, 3, 3, 'F');
    doc.setTextColor(GREEN); text('Remember to add your answers to your planning Google Sheet.', 13, y + 9, 11, true); y += 20;
    for (let start = 0; start < questions.length; start += 10) {
      const title = questions[start].topic || `Topic ${'ABC'[start / 10]}`;
      const h = Math.max(13, lines(title, 130, 12, true).length * 5 + 4) + 49;
      if (y + h > 277) page('Answer Key');
      doc.setDrawColor('#DFEAF5'); doc.setLineWidth(0.25); doc.roundedRect(7, y - 2, 196, h, 4, 4);
      heading(start / 10, title);
      questions.slice(start, start + 10).forEach((q, i) => {
        const x = i < 5 ? 12 : 108, rowY = y + (i % 5) * 8;
        doc.setFillColor(BLUE); doc.roundedRect(x, rowY, 90, 7, 2.5, 2.5, 'F');
        doc.setFillColor('#D5EAF7'); doc.roundedRect(x, rowY, 18, 7, 2.5, 2.5, 'F');
        doc.setTextColor(NAVY); text(`Q${start + i + 1}`, x + 4, rowY + 5, 11, true);
        text(q.correctAnswer !== undefined ? 'ABCD'[q.correctAnswer] || '—' : '—', x + 23, rowY + 5, 11);
      });
      y += 47;
    }
  }
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  kinds.forEach((kind, i) => {
    doc.setPage(i + 1); doc.setDrawColor(NAVY); doc.line(9, 283, 201, 283);
    doc.setTextColor(NAVY); text(`Page ${i + 1} of ${kinds.length}`, 10, 289, 9);
    doc.setFontSize(9); doc.text(`${date} – ${kind === 'Answer Key' ? 'Retrieval Quiz Answers' : kind}`, 200, 289, { align: 'right' });
  });
  return doc;
}
