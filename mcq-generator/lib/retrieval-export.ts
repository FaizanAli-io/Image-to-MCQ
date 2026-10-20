import type { GeneratedQuestion } from './types';

export function retrievalQuizFilename(questions: GeneratedQuestion[], level: 'GCSE' | 'A-LEVEL'): string {
  const topics = [...new Set(questions.map(q => (q.topic || '').replace(/^Topic\s+[A-Z]\s*:\s*/i, '').replace(/[\r\n]+/g, ' ').trim()).filter(Boolean))];
  const name = (topics.join(', ') || 'Quiz').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
  const suffix = ` - ${level} - Retrieval Quiz`;
  return name.slice(0, 180 - suffix.length).trim() + suffix + '.pdf';
}
