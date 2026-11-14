import { NextRequest, NextResponse } from 'next/server';
import { mapperJobView, readMapperJob } from '@/lib/mapper-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const { id } = await context.params;
    const job = await readMapperJob(id);
    if (!job || job.expiresAt <= Date.now()) return NextResponse.json({ error: 'This mapper job has expired or does not exist. Please upload the PDFs again.' }, { status: 404, headers });
    return NextResponse.json(await mapperJobView(job), { headers });
  } catch {
    return NextResponse.json({ error: 'Could not read mapper progress. Please reconnect shortly.' }, { status: 503, headers });
  }
}
