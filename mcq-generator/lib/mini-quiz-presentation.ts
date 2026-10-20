/** Remove mark annotations from student questions, preserving scientific brackets. */
export function miniQuizQuestionText(text: string): string {
  return text.replace(/\s*\[\s*\d+\s+marks?\s*\]/gi, '').replace(/\s*\[\s*\d+\s*\]\s*$/, '').trim();
}
