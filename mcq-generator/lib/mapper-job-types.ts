import type { ExtractedQuestion } from './question-extraction';
import type { QuestionMapping, TopicEntry } from './mapper-mapping-service';

export type MapperJobKind = 'extraction' | 'mapping';
export interface MapperInput {
  kind: MapperJobKind;
  questions?: ExtractedQuestion[];
  topics?: TopicEntry[];
}
export interface MapperResult {
  success: true;
  questions: ExtractedQuestion[];
  count?: number;
  metadata?: { extractionVersion: string; sourceCoverage: string; pastPaperLength: number; markSchemeLength: number; extractedAt: string };
  results?: QuestionMapping[];
  stats?: Record<string, number>;
}
export interface MapperJob {
  id: string;
  kind: MapperJobKind;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  createdAt: number;
  expiresAt: number;
  runs: number;
  completed: number;
  total: number;
  error?: string;
}
export interface MapperJobView {
  jobId: string;
  kind: MapperJobKind;
  status: MapperJob['status'];
  completed: number;
  total: number;
  workerAvailable?: boolean;
  result?: MapperResult;
  error?: string;
}
