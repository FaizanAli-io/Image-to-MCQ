import { NextRequest, NextResponse } from 'next/server';
import { createMapperJob, mapperWorkerAvailable } from '@/lib/mapper-jobs';
import type { ExtractedQuestion } from '@/lib/question-extraction';
import type { TopicEntry } from '@/lib/mapper-mapping-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    if (Buffer.byteLength(body) > 20 * 1024 * 1024) return NextResponse.json({ error: 'Mapping input must be smaller than 20MB.' }, { status: 413 });
    const { questions, topics } = JSON.parse(body) as { questions: ExtractedQuestion[]; topics: TopicEntry[] };
    if (!Array.isArray(questions) || !questions.length || questions.some(q => !q || typeof q.question_id !== 'string' || !q.question_id.trim() || typeof q.text !== 'string' || !q.text.trim())) {
      return NextResponse.json({ error: 'Missing or invalid questions array' }, { status: 400 });
    }
    if (!Array.isArray(topics) || !topics.length || topics.some(t => !t || typeof t.Code !== 'string' || typeof t.Name !== 'string')) {
      return NextResponse.json({ error: 'Missing or invalid topics array' }, { status: 400 });
    }
    if (!await mapperWorkerAvailable()) return NextResponse.json({ error: 'The mapper worker is unavailable. Please contact support to start it.' }, { status: 503 });
    const job = await createMapperJob({ kind: 'mapping', questions, topics }, [], req.headers.get('X-Mapper-Request-Id'));
    return NextResponse.json({ jobId: job.id, kind: job.kind, status: job.status }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? 'Invalid mapping request.' : 'Could not save the mapping job. Please try again.' }, { status: error instanceof SyntaxError ? 400 : 500 });
  }
}
