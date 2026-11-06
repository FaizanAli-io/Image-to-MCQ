import * as XLSX from 'xlsx';
import { questionKey } from './mapper-source';

export interface Question {
  question_id: string;
  text: string;
  mark_scheme?: string;
  source_marks?: number | null;
  source_page?: number;
  source_part_ids?: string[];
  extraction_review?: string;
}

export interface QuestionMapping {
  question_id: string;
  primary_topic: string | null;
  topic_name: string;
  secondary_topic: string | null;
  reason: string;
  needs_review: boolean;
  review_reason: string | null;
}

interface ParsedQuestionId {
  main: number;
  subLabel: string;
  depth: number;
}

export function parseQuestionId(questionId: string): ParsedQuestionId {
  const cleaned = questionId
    .trim()
    .replace(/^question\s*/i, '')
    .replace(/^q/i, '');
  const mainMatch = cleaned.match(/^(\d+)/);
  const main = mainMatch ? parseInt(mainMatch[1], 10) : 0;
  const remainder = mainMatch ? cleaned.slice(mainMatch[1].length).trim() : cleaned;
  const parts: string[] = [];
  const firstPart = remainder.split('(')[0].replace(/[^a-z0-9]/gi, '');

  if (firstPart) {
    const compact = firstPart.toLowerCase().match(/^([a-hj-uw-z])([ivx]+)$/);
    parts.push(...(compact ? compact.slice(1) : [firstPart.toLowerCase()]));
  }

  for (const match of remainder.matchAll(/\(([a-z0-9ivxlcdm]+)\)/gi)) {
    parts.push(match[1].toLowerCase());
  }

  return {
    main,
    subLabel: parts.length ? `${parts[0]}${parts.slice(1).map(part => `(${part})`).join('')}` : 'whole',
    depth: parts.length,
  };
}

export function getQuestionMarks(question?: Question): number | null {
  if (!question) return null;
  if (Object.prototype.hasOwnProperty.call(question, 'source_marks')) {
    return typeof question.source_marks === 'number' && Number.isInteger(question.source_marks) && question.source_marks > 0
      ? question.source_marks : null;
  }

  const text = question.text.trim();
  const explicitMarkMatches = [
    ...text.matchAll(/(?:\[(\d+)\s*marks?\]|\((\d+)\s*marks?\))/gi),
  ];

  if (explicitMarkMatches.length) {
    if (explicitMarkMatches.length !== 1) return null;
    const match = explicitMarkMatches[0];
    return parseInt(match[1] || match[2], 10) || null;
  }

  const lines = text
    .split(/\r?\n|(?<=\.)\s+(?=[\[(]\d+[\])]\s*$)/)
    .map(line => line.trim())
    .filter(Boolean);

  const allocations: number[] = [];
  for (const line of lines) {
    const endMarkMatch = line.match(/(?:\[(\d+)\]|\((\d+)\))\s*$/);

    if (endMarkMatch) {
      allocations.push(parseInt(endMarkMatch[1] || endMarkMatch[2], 10));
    }
  }

  return allocations.length === 1 ? allocations[0] || null : null;
}

function romanToNumber(value: string): number | null {
  if (!/^[ivxlcdm]+$/i.test(value)) return null;

  const numerals: Record<string, number> = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  };
  let total = 0;
  let previous = 0;

  [...value.toLowerCase()].reverse().forEach(char => {
    const current = numerals[char];

    if (current < previous) {
      total -= current;
    } else {
      total += current;
      previous = current;
    }
  });

  return total;
}

function compareSubLabels(a: string, b: string): number {
  if (a === 'whole') return b === 'whole' ? 0 : -1;
  if (b === 'whole') return 1;

  const tokenize = (label: string) =>
    [label.split('(')[0], ...[...label.matchAll(/\(([^)]+)\)/g)].map(match => match[1])];
  const aParts = tokenize(a);
  const bParts = tokenize(b);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index++) {
    const aPart = aParts[index] || '';
    const bPart = bParts[index] || '';

    if (aPart === bPart) continue;

    const numericA = Number(aPart);
    const numericB = Number(bPart);
    if (!Number.isNaN(numericA) && !Number.isNaN(numericB)) {
      return numericA - numericB;
    }

    const romanA = romanToNumber(aPart);
    const romanB = romanToNumber(bPart);
    if (romanA !== null && romanB !== null) {
      return romanA - romanB;
    }

    return aPart.localeCompare(bPart, undefined, { numeric: true });
  }

  return 0;
}

export function reconcileMappings(mappingResults: QuestionMapping[], questions: Question[]): QuestionMapping[] {
  // Drive exports from the paper, including any question a mapping response omitted.
  const mappingById = new Map(mappingResults.map(result => [questionKey(result.question_id), result]));
  const sourceKeys = new Set(questions.map(question => questionKey(question.question_id)));
  return questions.map(question => {
    const mapping = mappingById.get(questionKey(question.question_id));
    const reasons = [mapping?.review_reason, question.extraction_review,
      !mapping ? 'Topic mapping missing; manual review required.' : '',
      /\[Mark scheme not/i.test(question.mark_scheme || '') ? 'Mark scheme not matched; manual review required.' : '',
    ].filter((reason): reason is string => Boolean(reason));
    const review = [...new Set(reasons)].filter(reason => !reasons.some(other => other !== reason && other.includes(reason))).join(' ');
    return { question_id: question.question_id, primary_topic: mapping?.primary_topic ?? null,
      topic_name: mapping?.topic_name || '', secondary_topic: mapping?.secondary_topic ?? null,
      reason: mapping?.reason || '', needs_review: Boolean(mapping?.needs_review || review), review_reason: review || null,
    };
  }).concat(mappingResults.filter(result => !sourceKeys.has(questionKey(result.question_id))).map(result => ({
    ...result, needs_review: true, review_reason: 'No corresponding source question; verify this mapping.',
  })));
}

export function buildMappingsWorkbook(mappingResults: QuestionMapping[], questions: Question[]) {
  mappingResults = reconcileMappings(mappingResults, questions);
  const parsedById = new Map(
    mappingResults.map(result => [result.question_id, parseQuestionId(result.question_id)])
  );
  const questionById = new Map(questions.map(question => [question.question_id, question]));
  const groupedByMain = new Map<number, QuestionMapping[]>();

  mappingResults.forEach(result => {
    const parsed = parsedById.get(result.question_id)!;

    if (!groupedByMain.has(parsed.main)) {
      groupedByMain.set(parsed.main, []);
    }

    groupedByMain.get(parsed.main)!.push(result);
  });

  const sortedMainQuestions = [...groupedByMain.keys()].sort((a, b) => a - b);
  const maxSubPartCount = sortedMainQuestions.reduce((maxCount, main) => {
    const subPartCount = groupedByMain
      .get(main)!
      .filter(result => parsedById.get(result.question_id)!.subLabel !== 'whole')
      .length;

    return Math.max(maxCount, subPartCount);
  }, 0);
  const summaryWorksheet = XLSX.utils.aoa_to_sheet([]);
  const summaryHeaders = [
    'Question Number',
    'Total Question Marks',
    'whole',
    'Marks',
    ...Array.from({ length: maxSubPartCount }, (_, i) => [`Part ${i + 1}`, 'Topic', 'Marks']).flat(),
    'Review Notes',
  ];

  XLSX.utils.sheet_add_aoa(summaryWorksheet, [summaryHeaders], { origin: 'A1' });

  sortedMainQuestions.forEach((main, rowIndex) => {
    const entries = groupedByMain.get(main)!;
    const wholeEntries = entries.filter(result => parsedById.get(result.question_id)!.subLabel === 'whole');
    const subPartEntries = entries
      .filter(result => parsedById.get(result.question_id)!.subLabel !== 'whole')
      .sort((a, b) =>
        compareSubLabels(
          parsedById.get(a.question_id)!.subLabel,
          parsedById.get(b.question_id)!.subLabel
        )
      );
    const orderedEntries = [...wholeEntries, ...subPartEntries];
    const marks = orderedEntries.map(result => getQuestionMarks(questionById.get(result.question_id)));
    const knownTotalMarks = marks.reduce<number>((total, mark) => total + (mark ?? 0), 0);
    const expectedIds = new Set(orderedEntries.flatMap(result => questionById.get(result.question_id)?.source_part_ids || []).map(questionKey));
    const actualIds = new Set(orderedEntries.map(result => questionKey(result.question_id)));
    const missing = [...expectedIds].filter(id => !actualIds.has(id));
    const overlap = orderedEntries.some(entry => orderedEntries.some(other => {
      const a = parsedById.get(entry.question_id)!;
      const b = parsedById.get(other.question_id)!;
      return entry !== other && (a.subLabel === 'whole' || b.subLabel.startsWith(a.subLabel + '('));
    }));
    const unverified = !expectedIds.size;
    const totalMarks: string | number = marks.some(mark => mark === null) || missing.length || overlap
      ? '?' : unverified ? `${knownTotalMarks} (unverified)` : knownTotalMarks;
    const notes = [...new Set(orderedEntries.map(entry => entry.review_reason).filter(Boolean))];
    if (missing.length) notes.push(`Missing source parts: ${missing.join(', ')}`);
    if (overlap) notes.push('Parent and child entries overlap; verify mark allocations.');
    if (unverified) notes.push('Source coverage unverified; check total against the question paper.');
    const wholeTopic = [...new Set(wholeEntries.map(result => result.topic_name || result.primary_topic || '').filter(Boolean))].join('; ');
    const wholeMarks = wholeEntries.length
      ? marks.slice(0, wholeEntries.length).some(mark => mark === null)
        ? '?'
        : marks.slice(0, wholeEntries.length).reduce<number>((total, mark) => total + (mark ?? 0), 0)
      : '';
    const rowData: (string | number)[] = [main, totalMarks, wholeTopic, wholeMarks];

    subPartEntries.forEach(result => {
      const mark = getQuestionMarks(questionById.get(result.question_id));

      rowData.push(parsedById.get(result.question_id)!.subLabel);
      rowData.push(result.topic_name || result.primary_topic || '');
      rowData.push(mark === null ? '?' : mark);
    });

    while (rowData.length < summaryHeaders.length - 1) {
      rowData.push('');
    }
    rowData.push(notes.join(' '));

    XLSX.utils.sheet_add_aoa(summaryWorksheet, [rowData], { origin: `A${rowIndex + 2}` });
    });

  summaryWorksheet['!cols'] = [
    { wch: 18 },
    { wch: 24 },
    { wch: 35 },
    { wch: 12 },
    ...Array.from({ length: maxSubPartCount }).flatMap(() => [{ wch: 12 }, { wch: 35 }, { wch: 12 }]),
    { wch: 70 },
  ];

  const detailRows = mappingResults.map(result => {
    const parsed = parsedById.get(result.question_id)!;

    return {
      'Question ID': result.question_id,
      'Question Number': parsed.main,
      'Sub-question': parsed.subLabel,
      'Sub-question Depth': parsed.depth,
      'Primary Topic': result.primary_topic || '',
      'Topic Name': result.topic_name || '',
      'Secondary Topic': result.secondary_topic || '',
      'Marks': getQuestionMarks(questionById.get(result.question_id)) ?? '?',
      'Needs Review': result.needs_review ? 'Yes' : 'No',
      'Review Reason': result.review_reason || '',
      'Reason': result.reason || '',
    };
  });

  const detailsWorksheet = XLSX.utils.json_to_sheet(detailRows);
  detailsWorksheet['!cols'] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 36 },
    { wch: 16 },
    { wch: 10 },
    { wch: 14 },
    { wch: 20 },
    { wch: 70 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Question Mappings');
  XLSX.utils.book_append_sheet(workbook, detailsWorksheet, 'Detailed Mappings');

  return workbook;
}

