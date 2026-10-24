import jsPDF from 'jspdf';
import type { GeneratedQuestion } from './types';
import type { QuizStimulus } from './stimulus-types';
import { miniQuizTitle, type MiniQuizPDFOptions } from './mini-quiz-export';
import { miniQuizQuestionText } from './mini-quiz-presentation';
import { drawScientificLine, takeScientificLine } from './scientific-pdf';
import { layoutStimulus, type StimulusPanel, type DrawItem } from './stimulus-layout';
import { drawStimulusPanel } from './stimulus-pdf';

const NAVY = '#10276B', INK = '#344B80', BLUE = '#E6F2FA', RULE = '#DCE9F2', GREEN = '#23B887';
const M = 14, RIGHT = 196, WIDTH = RIGHT - M, BOTTOM = 281, LH = 4.8, SIZE = 10.3;
const SECTIONS = [
  ['AO1', 'Remember & Understand', 'ao1'],
  ['AO2', 'Apply & Analyse', 'ao2'],
  ['AO3', 'Analyse, Interpret & Evaluate', 'ao3'],
] as const;
type Section = typeof SECTIONS[number];
type MarkEntry = { questionNumber: number; markPoints: string[]; markingGuidance?: string; reasoningToLearn?: string };

/** Mini-only presentation. Generation, answer allocations and retrieval exports stay separate. */
export function generateMiniQuizPDF(questions: GeneratedQuestion[], options: MiniQuizPDFOptions = {}): jsPDF {
  const doc = new jsPDF();
  const topic = (questions[0]?.topic || 'Mini Quiz').replace(/[\r\n]+/g, ' ').trim();
  const level = options.educationLevel || questions[0]?.educationLevel || (questions.filter(q => q.aoLevel === 'AO1').length === 10 ? 'GCSE' : 'A-LEVEL');
  doc.setProperties({ title: miniQuizTitle(questions, level) });
  let y = 23, part: 'Mini Quiz' | 'Mark Scheme' = 'Mini Quiz';
  let active: Section | undefined;
  let image: { page: number; left: number; bottom: number } | undefined;
  let markStart = 0;
  const stimuli = new Map<string, { figure: number; first: number; last: number }>();

  function lines(text: string, width: number, size = SIZE, bold = false): string[] {
    const result: string[] = [];
    let rest = text;
    do {
      const [line, remaining] = takeScientificLine(doc, rest, width, size, bold);
      result.push(line); rest = remaining;
    } while (rest);
    return result;
  }
  function text(value: string, x: number, baseline: number, size = SIZE, bold = false, color = INK) {
    doc.setTextColor(color); doc.setDrawColor(color);
    drawScientificLine(doc, value, x, baseline, size, bold);
  }
  function rule(at: number, color = RULE, left = M, right = RIGHT) {
    doc.setDrawColor(color); doc.setLineWidth(0.25); doc.line(left, at, right, at);
  }
  function header() {
    text('Past Paper Pal', M, 12, 10, true, NAVY);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(NAVY);
    doc.text(`${level} | ${part}`, RIGHT, 12, { align: 'right' });
    rule(17, NAVY);
    y = 23;
  }
  function availableWidth(at = y) {
    return image && image.page === doc.getNumberOfPages() && at < image.bottom + 2 ? image.left - M - 5 : WIDTH;
  }
  function sectionBar(section: Section, continued = false) {
    const width = availableWidth();
    const label = `${section[0]} – ${section[1]}${continued ? ' (continued)' : ''}`;
    const wrapped = lines(label, width - 8, 11.7, true);
    const height = 5 + wrapped.length * 5.3;
    doc.setFillColor(BLUE); doc.roundedRect(M, y, width, height, 1.5, 1.5, 'F');
    wrapped.forEach((line, i) => text(line, M + 4, y + 6.7 + i * 5.3, 11.7, true, NAVY));
    y += height + 2.5;
  }
  function newPage(repeatSection = true) {
    doc.addPage(); header();
    if (repeatSection && active) sectionBar(active, true);
  }
  function ensure(height: number) { if (y + height > BOTTOM) newPage(); }
  function title(value: string) {
    const wrapped = lines(value, WIDTH, 24, true);
    wrapped.forEach(line => { ensure(11); text(line, M, y + 8, 24, true, NAVY); y += 11; });
    y += 2; rule(y, GREEN); y += 4;
  }
  function badge(label: string, at: number, marks?: number, continued = false) {
    doc.setFillColor(BLUE); doc.roundedRect(M, at + 1, 13, 7.2, 1.2, 1.2, 'F');
    doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(label.length > 3 ? 9 : 10.5);
    doc.text(label, M + 6.5, at + 6.1, { align: 'center' });
    if (marks !== undefined) {
      doc.setTextColor(INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2);
      doc.text(`${marks} ${marks === 1 ? 'mark' : 'marks'}`, M + 6.5, at + 12, { align: 'center' });
    }
    if (continued) text('cont.', M, at + (marks === undefined ? 11 : 16), 7);
  }

  // Keep a normal row intact. Oversized rows continue with a repeated badge and
  // section heading; all splitting uses measured lines, never clipped content.
  function row(label: string, paragraphs: string[], marks?: number) {
    let remaining = paragraphs.join('\n');
    let continued = false;
    while (remaining) {
      let width = availableWidth();
      let wrapped = lines(remaining, width - 24);
      const minHeight = marks === undefined ? 10 : 14;
      const height = Math.max(minHeight, wrapped.length * LH + 5);
      const freshHeight = Math.max(minHeight, lines(remaining, WIDTH - 24).length * LH + 5);
      if (y + height > BOTTOM && freshHeight <= BOTTOM - 39 && y > 40) {
        newPage(); width = availableWidth(); wrapped = lines(remaining, width - 24);
      }
      if (BOTTOM - y < minHeight + LH) { newPage(); continue; }
      const capacity = Math.max(1, Math.floor((BOTTOM - y - 5) / LH));
      const count = Math.min(wrapped.length, capacity);
      const fragmentHeight = Math.max(minHeight, count * LH + 5);
      const top = y;
      if (active?.[0] === 'AO3' || (part === 'Mark Scheme' && active?.[0] === 'AO2')) {
        doc.setDrawColor(RULE); doc.setLineWidth(0.2); doc.roundedRect(M, top, width, fragmentHeight, 1.5, 1.5, 'S');
      }
      badge(label, top, marks, continued);
      for (let i = 0; i < count; i++) text(wrapped[i], M + 20, top + 5.8 + i * LH);
      // Consume the same measured lines from the original text, so manual line
      // breaks and mathematical notation survive a continuation page.
      for (let i = 0; i < count; i++) remaining = takeScientificLine(doc, remaining, width - 24, SIZE)[1];
      y += fragmentHeight;
      rule(y, RULE, M, M + width);
      y += 2;
      if (remaining) { continued = true; newPage(); }
    }
  }
  function questionParagraphs(q: GeneratedQuestion) {
    const paragraphs = [miniQuizQuestionText(q.text)];
    if (q.type === 'MULTIPLE_CHOICE') q.options?.forEach((option, i) => paragraphs.push(`${String.fromCharCode(65 + i)}) ${option}`));
    if (q.type === 'TRUE_FALSE') paragraphs.push('True / False');
    return paragraphs;
  }
  function reference(id: string, title: string) {
    const known = stimuli.get(id)!;
    const pages = known.first === known.last ? `page ${known.first}` : `pages ${known.first}-${known.last}`;
    return `Use Stimulus ${known.figure}: ${title} (${pages}).`;
  }
  function panelHeight(panels: StimulusPanel[], width: number) {
    return panels.reduce((sum, panel) => sum + panel.height * width / panel.width, 0);
  }
  function drawPanels(panels: StimulusPanel[], x: number, at: number, width: number) {
    let cursor = at;
    for (const panel of panels) cursor += drawStimulusPanel(doc, panel, x, cursor, width);
  }
  function evidencePanels(stim: QuizStimulus, width: number): StimulusPanel[] {
    if (stim.kind !== 'text' && stim.kind !== 'table') return layoutStimulus(stim);
    // Reflow prose and table cells at their actual printed size. This avoids
    // shrinking a desktop-sized text panel into illegible sidebar typography.
    const result: StimulusPanel[] = [];
    let items: DrawItem[] = [], at = 5;
    const flush = () => {
      if (items.length) result.push({ width, height: at + 2, items });
      items = []; at = 5;
    };
    for (const paragraph of [...(stim.context ? [stim.context] : []), ...(stim.kind === 'text' ? stim.paragraphs : [])]) {
      for (const line of lines(paragraph, width - 6, 9)) {
        if (at > 145) flush();
        items.push({ type: 'text', text: line, x: 3, y: at, size: 9 * 25.4 / 72 }); at += 4.4;
      }
      at += 2;
    }
    flush();
    if (stim.kind === 'table') {
      const cellWidth = width / stim.columns.length;
      const cellLines = (cells: string[], bold: boolean) => cells.map(cell => lines(cell, cellWidth - 4, 8.5, bold));
      const headerLines = cellLines(stim.columns, true);
      const rowHeight = (cells: string[][]) => Math.max(...cells.map(cell => cell.length)) * 4.2 + 4;
      const drawRow = (cells: string[][], bold: boolean) => {
        const height = rowHeight(cells);
        cells.forEach((cell, column) => {
          items.push({ type: 'rect', x: column * cellWidth, y: at, width: cellWidth, height, ...(bold ? { fill: BLUE } : {}) });
          cell.forEach((line, i) => items.push({ type: 'text', text: line, x: column * cellWidth + 2, y: at + 4.2 + i * 4.2, size: 8.5 * 25.4 / 72, bold }));
        });
        at += height;
      };
      at = 1; drawRow(headerLines, true);
      for (const cells of stim.rows) {
        const wrapped = cellLines(cells, false);
        if (at + rowHeight(wrapped) > 190 && at > rowHeight(headerLines) + 1) {
          flush(); at = 1; drawRow(headerLines, true);
        }
        drawRow(wrapped, false);
      }
      flush();
    }
    return result;
  }
  function stimulus(stim: QuizStimulus, q: GeneratedQuestion, number: number, sideBySide: boolean) {
    const figure = stimuli.size + 1;
    const caption = `Stimulus ${figure}: ${stim.title}`;
    // Only short, readable evidence sits alongside a question. Large graphs and
    // long table labels retain the full column width and paginate as needed.
    const sideWidth = 112, fullWidth = WIDTH - 28;
    const sidePanels = evidencePanels(stim, sideWidth);
    const smallLabels = sidePanels.some(p => p.items.some(item => item.type === 'text' && item.size * sideWidth / p.width * 72 / 25.4 < 7.2));
    const questionLines = lines(questionParagraphs(q).join('\n'), WIDTH - sideWidth - 31);
    const sideTitle = lines(caption, WIDTH - 24, 10, true);
    const sideHeight = Math.max(panelHeight(sidePanels, sideWidth), questionLines.length * LH) + sideTitle.length * 5 + 14;
    if (sideBySide && !smallLabels && sideHeight < 150) {
      ensure(sideHeight + 3);
      const top = y;
      doc.setDrawColor(RULE); doc.setLineWidth(0.25); doc.roundedRect(M, top, WIDTH, sideHeight, 1.5, 1.5, 'S');
      badge(String(number), top);
      sideTitle.forEach((line, i) => text(line, M + 20, top + 6 + i * 5, 10, true, NAVY));
      const contentY = top + 8 + sideTitle.length * 5;
      drawPanels(sidePanels, M + 20, contentY, sideWidth);
      questionLines.forEach((line, i) => text(line, M + 25 + sideWidth, contentY + 4 + i * LH));
      stimuli.set(stim.id, { figure, first: doc.getNumberOfPages(), last: doc.getNumberOfPages() });
      y += sideHeight + 3;
      return true;
    }
    const panels = evidencePanels(stim, fullWidth);
    const chunks: StimulusPanel[][] = [];
    for (const panel of panels) {
      const previous = chunks[chunks.length - 1];
      if (previous && panelHeight([...previous, panel], fullWidth) < 205) previous.push(panel);
      else chunks.push([panel]);
    }
    chunks.forEach((chunk, index) => {
      const captionLines = lines(`${caption}${index ? ' (continued)' : ''}`, fullWidth, 10, true);
      const height = panelHeight(chunk, fullWidth) + captionLines.length * 5 + 10;
      ensure(height + (index === chunks.length - 1 ? 14 : 0));
      const top = y;
      doc.setDrawColor(RULE); doc.setLineWidth(0.25); doc.roundedRect(M + 17, top, WIDTH - 17, height, 1.5, 1.5, 'S');
      captionLines.forEach((line, i) => text(line, M + 21, top + 6 + i * 5, 10, true, NAVY));
      drawPanels(chunk, M + 21, top + 8 + captionLines.length * 5, fullWidth);
      stimuli.set(stim.id, { figure, first: stimuli.get(stim.id)?.first ?? doc.getNumberOfPages(), last: doc.getNumberOfPages() });
      y += height + 3;
    });
    return false;
  }

  header(); title(topic);
  if (questions.some(q => q.reviewStatus === 'recommended' || q.reviewStatus === 'unavailable')) {
    row('!', ['DRAFT - Review AO3 questions and answers before use.']);
  }
  for (const section of SECTIONS) {
    const entries = questions.map((q, i) => ({ q, number: q.questionNumber || i + 1 })).filter(({ q }) => q.aoLevel === section[0]);
    if (!entries.length) continue;
    active = undefined;
    const first = entries[0].q;
    const firstText = lines(questionParagraphs(first).join('\n'), WIDTH - 24).length * LH + 5;
    const firstEvidence = first.stimuli?.find(s => !stimuli.has(s.id));
    const firstBlock = firstEvidence ? panelHeight(evidencePanels(firstEvidence, WIDTH - 28), WIDTH - 28) + 35 : firstText + 15;
    const minimum = firstBlock <= BOTTOM - 23 ? firstBlock : 55;
    if (y + minimum > BOTTOM) newPage(false);
    active = section; sectionBar(section);
    for (const { q, number } of entries) {
      const evidence = q.stimuli || [];
      let consumed = false;
      const refs: string[] = [];
      for (const stim of evidence) {
        if (stimuli.has(stim.id)) refs.push(reference(stim.id, stim.title));
        else {
          consumed = stimulus(stim, q, number, evidence.length === 1);
          if (!consumed) refs.push(`Refer to Stimulus ${stimuli.get(stim.id)!.figure}.`);
        }
      }
      if (!consumed) row(String(number), [...refs, ...questionParagraphs(q)]);
    }
    y += 3;
  }

  const scheme = questions[0]?.markScheme as Partial<Record<'ao1' | 'ao2' | 'ao3', MarkEntry[]>> | undefined;
  part = 'Mark Scheme'; active = undefined; newPage(false); markStart = doc.getNumberOfPages(); title('Mark Scheme');
  for (const section of SECTIONS) {
    const entries = scheme?.[section[2]] || [];
    if (!entries.length) continue;
    active = undefined; image = undefined;
    const bytes = options.images?.[section[2]];
    let imageHeight = 0, imageWidth = 54;
    if (bytes) {
      const props = doc.getImageProperties(bytes);
      imageHeight = imageWidth * props.height / props.width;
      if (imageHeight > 215) { imageWidth *= 215 / imageHeight; imageHeight = 215; }
    }
    const firstEntry = entries[0];
    const firstParagraphs = [...(firstEntry.markingGuidance ? [firstEntry.markingGuidance] : []), ...firstEntry.markPoints,
      ...(firstEntry.reasoningToLearn ? [`Reasoning to learn: ${firstEntry.reasoningToLearn}`] : [])];
    const firstWidth = bytes ? WIDTH - imageWidth - 5 : WIDTH;
    const firstRowHeight = lines(firstParagraphs.join('\n'), firstWidth - 24).length * LH + 5;
    const firstSectionHeight = lines(`${section[0]} – ${section[1]}`, firstWidth - 8, 11.7, true).length * 5.3 + 7.5;
    const intro = firstRowHeight + firstSectionHeight <= BOTTOM - 23 ? firstRowHeight + firstSectionHeight : 40;
    if (y + Math.max(imageHeight, intro) > BOTTOM) newPage(false);
    if (bytes) {
      const left = RIGHT - imageWidth;
      doc.addImage(bytes, 'PNG', left, y, imageWidth, imageHeight, section[2], 'FAST');
      image = { page: doc.getNumberOfPages(), left, bottom: y + imageHeight };
    }
    active = section; sectionBar(section);
    for (const entry of entries) {
      const question = questions.find((q, i) => (q.questionNumber || i + 1) === entry.questionNumber);
      const paragraphs = [
        ...(entry.markingGuidance ? [entry.markingGuidance] : []),
        ...entry.markPoints.map(point => `• ${point}`),
        ...(entry.reasoningToLearn ? [`Reasoning to learn: ${entry.reasoningToLearn}`] : []),
      ];
      row(`Q${entry.questionNumber}`, paragraphs, question?.maxMarks);
    }
    if (image?.page === doc.getNumberOfPages()) y = Math.max(y, image.bottom + 3);
    image = undefined; y += 4;
  }
  // Final pass supplies accurate totals without reserving content-dependent text.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const marks = p >= markStart;
    const page = marks ? p - markStart + 1 : p;
    const total = marks ? pages - markStart + 1 : markStart - 1;
    rule(284);
    text(`Page ${page} of ${total}`, M, 290, 8);
    const label = `${topic} - ${marks ? 'Mark Scheme' : 'Mini Quiz'}`;
    const short = lines(label, 135, 8)[0];
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(INK);
    doc.text(short, RIGHT, 290, { align: 'right' });
  }
  return doc;
}
