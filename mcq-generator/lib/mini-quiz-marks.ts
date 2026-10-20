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
      if (!Array.isArray(entry.markPoints) || entry.markPoints.length < 1 || entry.markPoints.length > 8) {
        throw new Error(`Q${number}: missing or excessive marking points`);
      }
      const explicit = /\b(?:state|give|identify|name|suggest|describe|explain|list|select|provide|outline)\s+(?:any\s+)?(one|two|three|four|five|six|[1-6])\b/i.exec(question.text);
      const words = ['one', 'two', 'three', 'four', 'five', 'six'];
      const writtenCount = explicit ? (Number(explicit[1]) || words.indexOf(explicit[1].toLowerCase()) + 1) : null;
      const requested = question.requestedResponses ?? writtenCount;
      if (writtenCount && requested !== writtenCount) throw new Error(`Q${number}: requested response count contradicts question wording`);
      // Direct AO1 lists can legitimately supply more acceptable alternatives
      // than students must name. Do not count every alternative cumulatively.
      // Explanation/application questions still require complete response groups.
      const alternatives = section === 'ao1' && writtenCount !== null && requested === writtenCount
        && question.maxMarks === requested && entry.markPoints.length > requested
        && /^\s*(?:name|state|give|identify|list)\s+(?:any\s+)?(?:one|two|three|four|five|six|[1-6])\b/i.test(question.text)
        && !/\b(?:explain|explanation|describe|justify|reason|why|how)\b/i.test(question.text);
      if (alternatives) {
        entry.markingGuidance = `Award 1 mark for each distinct correct response, up to ${requested} marks. Accept any ${requested} of the alternatives below; do not award all alternatives cumulatively.`;
      } else if (requested != null) {
        // One requested response has exactly one group containing all its points.
        // Rebuild redundant metadata even if the model supplied several groups,
        // empty groups, repeated indices or an incomplete group.
        if (requested === 1) {
          entry.responseGroups = [entry.markPoints.map((_, index) => index + 1)];
        }
        const groups = entry.responseGroups;
        if (!Number.isInteger(requested) || requested < 1 || requested > 8 || !Array.isArray(groups)
          || groups.length !== requested || groups.some(group => !Array.isArray(group) || !group.length)) {
          throw new Error(`Q${number}: marking groups must match the ${requested} requested responses`);
        }
        const indices = groups.flat();
        if (indices.length !== entry.markPoints.length || new Set(indices).size !== indices.length
          || indices.some(index => !Number.isInteger(index) || index < 1 || index > entry.markPoints.length)) {
          throw new Error(`Q${number}: every marking point must belong to exactly one requested response`);
        }
        if (requested > 1 && /\bexplain\b.*\beach\b|\bexplanation\s+for\s+each\b/i.test(question.text)
          && groups.some(group => group.length < 2)) {
          throw new Error(`Q${number}: each requested response needs its own explanation point`);
        }
      } else if (entry.responseGroups?.length) {
        throw new Error(`Q${number}: marking response groups require a response count`);
      }
      if (question.aoLevel !== section.toUpperCase() || !question.text?.trim()
        || !['SHORT_ANSWER', 'LONG_ANSWER'].includes(question.type)) {
        throw new Error(`Q${number}: invalid question or assessment objective`);
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
