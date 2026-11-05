import { NextResponse } from 'next/server';
import { readJob, publicJob } from '@/lib/mini-quiz-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = await readJob(id);
  if (!job || job.expiresAt < Date.now()) {
    return NextResponse.json({ error: 'This quiz has expired or could not be found. Please generate it again.', code: 'JOB_NOT_FOUND' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  // The random 256-bit ID is a bearer capability. Never expose job listings,
  // source paths, signed image URLs, private drafts or API diagnostics here.
  return NextResponse.json(publicJob(job), { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
