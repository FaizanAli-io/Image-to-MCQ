export type MiniQuizLevel = 'GCSE' | 'A-LEVEL';

export function miniQuizCounts(level: MiniQuizLevel) {
  const ao1 = level === 'GCSE' ? 10 : 8;
  const ao2 = 6;
  const ao3 = level === 'GCSE' ? 3 : 6;
  return { ao1, ao2, ao3, total: ao1 + ao2 + ao3, firstAO3: ao1 + ao2 + 1 };
}
