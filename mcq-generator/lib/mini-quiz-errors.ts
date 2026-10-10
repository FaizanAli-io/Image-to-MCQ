export class MiniQuizEvidenceError extends Error {
  readonly code = 'INVALID_AO3_EVIDENCE';
  constructor(cause: unknown) {
    super('The AI returned missing or invalid question, marking or stimulus data. Please generate the quiz again.', { cause });
    this.name = 'MiniQuizEvidenceError';
  }
}
