import { miniQuizCounts, type MiniQuizLevel } from './mini-quiz-config';

export interface MiniQuizMarkEntry {
  questionNumber: number;
  markPoints: string[];
  reasoningToLearn?: string | null;
}

export interface MiniQuizDraft {
  topicName: string;
  questions: {
    text: string;
    type: 'SHORT_ANSWER' | 'LONG_ANSWER';
    aoLevel: 'AO1' | 'AO2' | 'AO3';
    maxMarks: number;
  }[];
  markScheme: { ao1: MiniQuizMarkEntry[]; ao2: MiniQuizMarkEntry[]; ao3: MiniQuizMarkEntry[] };
}

/** Derive marks from distinct one-mark points, never invent content to fill a total. */
export function reconcileMiniQuizMarks(raw: MiniQuizDraft, level: MiniQuizLevel): void {
  const counts = miniQuizCounts(level);
  if (!Array.isArray(raw.questions) || raw.questions.length !== counts.total) {
    throw new Error(`Expected ${counts.total} mini-quiz questions`);
  }
  let offset = 0;
  for (const section of ['ao1', 'ao2', 'ao3'] as const) {
    const entries = raw.markScheme?.[section];
    if (!Array.isArray(entries) || entries.length !== counts[section]) {
      throw new Error(`${section}: missing marking entries`);
    }
    const seen = new Set<number>();
    for (const entry of entries) {
      const number = entry.questionNumber;
      if (!Number.isInteger(number) || number <= offset || number > offset + counts[section] || seen.has(number)) {
        throw new Error(`${section}: marking entries must match each question exactly once`);
      }
      seen.add(number);
      const question = raw.questions[number - 1];
      if (question.aoLevel !== section.toUpperCase() || !question.text?.trim()
        || !['SHORT_ANSWER', 'LONG_ANSWER'].includes(question.type)) {
        throw new Error(`Q${number}: invalid question or assessment objective`);
      }
      if (!Array.isArray(entry.markPoints) || entry.markPoints.length < 1 || entry.markPoints.length > 8) {
        throw new Error(`Q${number}: missing or excessive marking points`);
      }
      const distinct = new Set<string>();
      entry.markPoints = entry.markPoints.map(point => {
        if (typeof point !== 'string' || !/\S.*\[1\]\s*$/.test(point)) {
          throw new Error(`Q${number}: each distinct marking point must end in [1]`);
        }
        const key = point.replace(/\s*\[1\]\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!key || distinct.has(key)) throw new Error(`Q${number}: duplicate or empty marking point`);
        distinct.add(key);
        return point.trim();
      });
      question.maxMarks = entry.markPoints.length;
    }
    entries.sort((a, b) => a.questionNumber - b.questionNumber);
    offset += counts[section];
  }
}
