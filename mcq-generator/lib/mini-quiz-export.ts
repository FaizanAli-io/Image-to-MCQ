import type { GeneratedQuestion } from './types';
export interface MiniQuizPDFOptions {
  educationLevel?: 'GCSE' | 'A-LEVEL';
  images?: Partial<Record<'ao1' | 'ao2' | 'ao3', Uint8Array>>;
}

export function miniQuizTitle(questions: GeneratedQuestion[], level?: 'GCSE' | 'A-LEVEL'): string {
  const topic = (questions[0]?.topic || 'Mini Quiz').replace(/[\r\n]+/g, ' ').trim();
  const education = level || questions[0]?.educationLevel || (questions.filter(q => q.aoLevel === 'AO1').length === 10 ? 'GCSE' : 'A-LEVEL');
  return `${topic} - ${education} - Mini Quiz`;
}

export function miniQuizFilename(questions: GeneratedQuestion[], level?: 'GCSE' | 'A-LEVEL'): string {
  return miniQuizTitle(questions, level).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 180).trim() + '.pdf';
}

export async function loadMiniQuizImages(): Promise<NonNullable<MiniQuizPDFOptions['images']>> {
  const entries = await Promise.all((['ao1', 'ao2', 'ao3'] as const).map(async key => {
    const response = await fetch(`/data/${key.toUpperCase()}.png`);
    if (!response.ok) throw new Error(`Could not load ${key.toUpperCase()} mark-scheme image. Please try downloading again.`);
    return [key, new Uint8Array(await response.arrayBuffer())] as const;
  }));
  return Object.fromEntries(entries);
}
