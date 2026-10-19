export class MiniQuizEvidenceError extends Error {
  readonly code = 'INVALID_AO3_EVIDENCE';
  constructor(cause: unknown) {
    // Validation messages contain field names and checks, never raw model output,
    // credentials or uploaded page URLs. Keep other errors private.
    const detail = cause instanceof Error && /^(AO3 output needs correction:|Q\d+:|ao[123]:|AO[123]:|Expected \d+ mini-quiz questions)/.test(cause.message)
      ? ` ${cause.message}` : '';
    super(`The generated quiz has incomplete or inconsistent data.${detail} Please generate the quiz again.`, { cause });
    this.name = 'MiniQuizEvidenceError';
  }
}
