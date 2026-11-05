import { miniQuizCounts, type MiniQuizLevel } from './mini-quiz-config';
import { reconcileMiniQuizSection, type MiniQuizDraft } from './mini-quiz-marks';
import { normalizeMiniQuizStimulus } from './mini-quiz-normalize';
import { validateAO3Result } from './mini-quiz-stimuli';
import { MiniQuizEvidenceError } from './mini-quiz-errors';

export type MiniSection = 'ao1' | 'ao2' | 'ao3';
export interface MiniSectionDraft {
  topicName: string;
  questions: MiniQuizDraft['questions'];
  markScheme: MiniQuizDraft['markScheme']['ao1'];
  stimuli?: unknown[];
}
export interface MiniGenerationOptions {
  deadlineMs?: number;
  completed?: Partial<Record<MiniSection, MiniSectionDraft>>;
  attempts?: Partial<Record<MiniSection, number>>;
  onSection?: (section: MiniSection, draft: MiniSectionDraft) => Promise<void>;
  onAttempt?: (section: MiniSection, attempt: number) => Promise<void>;
}

export function validateMiniSection(value: MiniSectionDraft, level: MiniQuizLevel, section: MiniSection): MiniSectionDraft {
  // Never mutate a saved checkpoint or the original failed response.
  const draft = structuredClone(value);
  const counts = miniQuizCounts(level);
  if (!Array.isArray(draft?.questions) || draft.questions.length !== counts[section]
    || !Array.isArray(draft.markScheme) || draft.markScheme.length !== counts[section]) {
    throw new Error(`${section.toUpperCase()}: incorrect section count`);
  }
  draft.questions.forEach((q, i) => {
    if (typeof q.text !== 'string') throw new Error(`${section.toUpperCase()}: missing question text`);
    q.text = q.text.replace(new RegExp(`^(?:Question\\s+${i + 1}[.):]?\\s+|${i + 1}[.)]\\s+)`, 'i'), '');
  });
  reconcileMiniQuizSection(draft.questions, draft.markScheme, section);
  if (section === 'ao3') {
    draft.stimuli = (draft.stimuli || []).map(normalizeMiniQuizStimulus);
    const offset = counts.firstAO3 - 1;
    validateAO3Result({
      questions: [...Array.from({ length: offset }, () => ({ stimulusIds: [] })), ...draft.questions],
      stimuli: draft.stimuli,
      markScheme: { ao3: draft.markScheme.map(m => ({ ...m, questionNumber: m.questionNumber + offset })) },
    }, level);
  }
  return draft;
}

export function isTransientMiniFailure(error: unknown): boolean {
  const e = error as { status?: number; name?: string };
  return e?.name === 'APIConnectionTimeoutError' || e?.name === 'APIConnectionError'
    || [408, 409, 429].includes(e?.status ?? 0) || (e?.status ?? 0) >= 500;
}

/** One recovery attempt per section. Successful sections are never regenerated. */
export async function recoverMiniSection(
  section: MiniSection, level: MiniQuizLevel, options: MiniGenerationOptions,
  request: (timeout: number, repair?: { draft: MiniSectionDraft; issue: string }) => Promise<MiniSectionDraft>,
): Promise<MiniSectionDraft> {
  if (options.completed?.[section]) return validateMiniSection(options.completed[section]!, level, section);
  let repair: { draft: MiniSectionDraft; issue: string } | undefined;
  const deadline = options.deadlineMs ?? Date.now() + 160_000;
  for (let attempt = (options.attempts?.[section] ?? 0) + 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 5_000) throw new Error('Quiz generation time budget exhausted. Please try again.');
    if (options.onAttempt) await options.onAttempt(section, attempt);
    const start = Date.now();
    let raw: MiniSectionDraft;
    try {
      raw = await request(Math.min(120_000, remaining), repair);
    } catch (error) {
      console.warn('Mini quiz section request failed', { section, attempt, durationMs: Date.now() - start, name: (error as Error)?.name, status: (error as { status?: number })?.status });
      const malformed = error instanceof SyntaxError || (error as Error)?.name === 'MiniQuizEvidenceError';
      if (attempt === 2 || (!malformed && !isTransientMiniFailure(error))) throw error;
      await new Promise(resolve => setTimeout(resolve, 1_000));
      continue;
    }
    let draft: MiniSectionDraft;
    try {
      // For an isolated AO1/AO2 marking error, only accept the affected question
      // and its answer; discard incidental edits to valid neighbouring questions.
      const match = repair?.issue.match(/^Q(\d+):/);
      if (repair && match && section !== 'ao3') {
        const n = Number(match[1]);
        const original = structuredClone(repair.draft);
        const replacement = raw.markScheme?.find(m => m.questionNumber === n);
        if (!raw.questions?.[n - 1] || !replacement) throw new Error(`Q${n}: incomplete repair`);
        original.questions[n - 1] = raw.questions[n - 1];
        original.markScheme = original.markScheme.map(m => m.questionNumber === n ? replacement : m);
        raw = original;
      }
      draft = validateMiniSection(raw, level, section);
    } catch (error) {
      console.warn('Mini quiz section validation failed', { section, attempt, durationMs: Date.now() - start, check: new MiniQuizEvidenceError(error).message });
      if (attempt === 2) {
        const counts = miniQuizCounts(level);
        const offset = section === 'ao1' ? 0 : section === 'ao2' ? counts.ao1 : counts.firstAO3 - 1;
        const message = error instanceof Error ? error.message : 'Invalid section structure';
        // Mark checks use local section numbering; evidence checks already name
        // global question numbers. Only translate a leading local Q number.
        throw new MiniQuizEvidenceError(new Error(message.replace(/^Q(\d+):/, (_, n) => `Q${Number(n) + offset}:`)));
      }
      repair = { draft: raw, issue: error instanceof Error ? error.message : 'Invalid section structure' };
      continue;
    }
    await options.onSection?.(section, draft);
    console.info('Mini quiz section completed', { section, attempt, durationMs: Date.now() - start });
    return draft;
  }
  throw new Error(`${section.toUpperCase()} recovery attempts exhausted. Please generate again.`);
}
