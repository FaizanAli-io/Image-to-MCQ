import { miniQuizCounts, type MiniQuizLevel } from './mini-quiz-config';

export interface MiniQuizMarkEntry {
  questionNumber: number;
  markPoints: string[];
  reasoningToLearn?: string | null;
  responseGroups?: number[][];
  markingGuidance?: string;
}

export interface MiniQuizDraft {
  topicName: string;
  questions: {
    text: string;
    type: 'SHORT_ANSWER' | 'LONG_ANSWER';
    aoLevel: 'AO1' | 'AO2' | 'AO3';
    maxMarks: number;
    requestedResponses?: number | null;
  }[];
  markScheme: { ao1: MiniQuizMarkEntry[]; ao2: MiniQuizMarkEntry[]; ao3: MiniQuizMarkEntry[] };
}

function responseRequests(text: string): number[] {
  const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  // Count separate instructions, not just the first match. Require a whole count
  // token so "give 2.5 cm3" and "describe one-third" are not answer counts.
  const matches = text.matchAll(/(?:^\s*|[.!?;:,]\s*|\b(?:and|then)\s+)(?:state|give|identify|name|suggest|describe|explain|list|select|provide|outline)\s+(?:any\s+)?(one|two|three|four|five|six|seven|eight|[1-8])(?=\s+[A-Za-z])/gi);
  return [...matches].map(match => Number(match[1]) || words.indexOf(match[1].toLowerCase()) + 1);
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
      const requests = responseRequests(question.text);
      const writtenCount = requests.length ? requests.reduce((sum, count) => sum + count, 0) : null;
      // requestedResponses is redundant model bookkeeping, not another source
      // of truth. A disagreement must not reject valid questions and answers.
      const requested = writtenCount;
      if (question.requestedResponses !== undefined || requested !== null) question.requestedResponses = requested;
      // Direct AO1 lists can legitimately supply more acceptable alternatives
      // than students must name. Do not count every alternative cumulatively.
      // Explanation/application questions still require complete response groups.
      const alternatives = section === 'ao1' && writtenCount !== null && requested === writtenCount
        && requests.length === 1 && question.maxMarks === requested && entry.markPoints.length > requested
        && /^\s*(?:name|state|give|identify|list)\s+(?:any\s+)?(?:one|two|three|four|five|six|[1-6])\b/i.test(question.text)
        && !/\b(?:explain|explanation|describe|justify|reason|why|how)\b/i.test(question.text);
      if (alternatives) {
        entry.markingGuidance = `Award 1 mark for each distinct correct response, up to ${requested} marks. Accept any ${requested} of the alternatives below; do not award all alternatives cumulatively.`;
      } else if (requested != null) {
        if (entry.markPoints.length < requested) {
          throw new Error(`Q${number}: not enough marking points for the ${requested} requested responses`);
        }
        // One requested response has exactly one group containing all its points.
        // Rebuild redundant metadata even if the model supplied several groups,
        // empty groups, repeated indices or an incomplete group.
        if (requested === 1) {
          entry.responseGroups = [entry.markPoints.map((_, index) => index + 1)];
        }
        const groups = entry.responseGroups;
        const indices = Array.isArray(groups) ? groups.flat() : [];
        const completeGroups = Array.isArray(groups) && groups.length > 0
          && groups.every(group => Array.isArray(group) && group.length > 0)
          && indices.length === entry.markPoints.length && new Set(indices).size === indices.length
          && indices.every(index => Number.isInteger(index) && index >= 1 && index <= entry.markPoints.length);
        const explainEach = requests.length === 1 && requested > 1
          && /\bexplain\b.*\beach\b|\bexplanation\s+for\s+each\b/i.test(question.text);
        if (explainEach && entry.markPoints.length < requested * 2) {
          throw new Error(`Q${number}: each requested response needs its own explanation point`);
        }
        if (entry.markPoints.length === requested) {
          // Exactly one point per requested response: indices are unambiguous.
          entry.responseGroups = entry.markPoints.map((_, index) => [index + 1]);
        } else if (completeGroups) {
          if (groups.length > requested) throw new Error(`Q${number}: marking groups must match the ${requested} requested responses`);
          if (groups.length < requested) entry.responseGroups = [];
          else if (explainEach && groups.some(group => group.length < 2)) {
            throw new Error(`Q${number}: each requested response needs its own explanation point`);
          }
        } else {
          // Broken/missing indices alone say nothing about scientific content.
          // Preserve every answer and its marks; do not invent a semantic grouping.
          entry.responseGroups = [];
        }
      } else if (entry.responseGroups?.length) {
        entry.responseGroups = [];
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
      question.maxMarks = alternatives ? requested! : entry.markPoints.length;
    }
    entries.sort((a, b) => a.questionNumber - b.questionNumber);
    offset += counts[section];
  }
}
