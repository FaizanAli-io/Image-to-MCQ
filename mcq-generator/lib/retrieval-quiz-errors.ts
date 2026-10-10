export class RetrievalQuizValidationError extends Error {
  constructor() {
    super('The AI returned an incomplete or malformed quiz. Please try again with readable source images.');
    this.name = 'RetrievalQuizValidationError';
  }
}
