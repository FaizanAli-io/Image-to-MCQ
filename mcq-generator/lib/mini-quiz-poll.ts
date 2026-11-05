import type { GeneratedQuestion } from './types';

export const PENDING_MINI_QUIZ = 'pendingMiniQuizJob';
export function forgetPendingMiniQuiz(id: string) {
  try {
    // Another tab may have started a different job while this one completed.
    if (localStorage.getItem(PENDING_MINI_QUIZ) === id) localStorage.removeItem(PENDING_MINI_QUIZ);
  } catch { /* Local storage may be unavailable. */ }
}
export class MiniQuizJobError extends Error {
  constructor(message: string, readonly code: string, readonly terminal: boolean) { super(message); }
}
export async function pollMiniQuiz(
  id: string, signal: AbortSignal, progress: (message: string) => void,
): Promise<GeneratedQuestion[]> {
  const deadline = Date.now() + 20 * 60_000;
  let failures = 0;
  while (!signal.aborted && Date.now() < deadline) {
    try {
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
      const response = await fetch(`/api/mini-quiz-jobs/${encodeURIComponent(id)}`, { cache: 'no-store', signal: requestSignal });
      if (response.status === 404) throw new MiniQuizJobError('This quiz has expired. Please generate it again.', 'JOB_NOT_FOUND', true);
      if (!response.ok) throw new Error('Temporary status request failure');
      const data = await response.json();
      failures = 0;
      if (data.status === 'succeeded' && Array.isArray(data.questions)) return data.questions;
      if (data.status === 'failed') throw new MiniQuizJobError(data.error, data.code, true);
      progress(data.status === 'queued' ? 'Your quiz is queued. It will start shortly.'
        : `Preparing your quiz: ${data.completedSections || 0} of 3 sections complete.`);
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof MiniQuizJobError) throw error;
      failures++;
      progress('Reconnecting to your quiz. Your progress is saved.');
      if (failures >= 12) break;
    }
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new Error('Polling stopped')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, failures ? 5_000 : 2_000);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  throw new MiniQuizJobError('Your quiz is still saved. Reload this page to reconnect and check its progress.', 'JOB_PENDING', false);
}
