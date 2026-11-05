import { NextRequest, NextResponse } from 'next/server';
import { generateMiniQuiz } from '@/lib/openai';
import { uploadToR2, deleteFromR2, getSignedR2Url } from '@/lib/r2-client';
import { MiniQuizEvidenceError } from '@/lib/mini-quiz-errors';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const started = Date.now();
  const uploadedKeys: string[] = [];

  try {
    const formData = await request.formData();
    // Preserve support for the original single-image request field.
    const entries = [...formData.getAll('images'), ...formData.getAll('image')];
    const educationLevel = formData.get('educationLevel') || "GCSE";
    if (educationLevel !== 'GCSE' && educationLevel !== 'A-LEVEL') {
      return NextResponse.json({ error: 'Education level must be GCSE or A-LEVEL' }, { status: 400 });
    }

    if (entries.length < 1 || entries.length > 10) {
      return NextResponse.json(
        { error: 'Mini Quiz requires 1 to 10 pages for the same quiz' },
        { status: 400 }
      );
    }

    const files: File[] = [];
    for (const entry of entries) {
      if (typeof entry === 'string' || !entry.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Each file must be an image' }, { status: 400 });
      }
      if (entry.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Each image must be 10MB or smaller' }, { status: 400 });
      }
      files.push(entry);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    if (process.env.MINI_QUIZ_BACKGROUND_JOBS === 'true') {
      const { createJob, workerAvailable, listJobIds, readJob, publicJob } = await import('@/lib/mini-quiz-jobs');
      if (!await workerAvailable()) {
        return NextResponse.json({ error: 'Quiz generation is temporarily unavailable. Please try again shortly.', code: 'WORKER_UNAVAILABLE', success: false }, { status: 503 });
      }
      const pending = await Promise.all((await listJobIds()).map(readJob));
      if (pending.filter(job => job && job.expiresAt > Date.now() && ['queued', 'running'].includes(job.status)).length >= 50) {
        return NextResponse.json({ error: 'The generator is busy. Please try again shortly.', code: 'QUEUE_BUSY', success: false }, { status: 503 });
      }
      const job = await createJob(files, educationLevel);
      return NextResponse.json(publicJob(job), { status: 202, headers: { 'Cache-Control': 'no-store' } });
    }

    const signedUrls: string[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const key = await uploadToR2(buffer, file.name, file.type);
      // Track each upload before signing, so partial failures are cleaned up too.
      uploadedKeys.push(key);
      signedUrls.push(await getSignedR2Url(key));
    }

    const questions = await generateMiniQuiz(apiKey, signedUrls, educationLevel, { deadlineMs: started + 165_000 });
    const reviewStatus = questions.some(q => q.reviewStatus === 'unavailable') ? 'unavailable'
      : questions.some(q => q.reviewStatus === 'recommended') ? 'recommended' : 'not_run';
    return NextResponse.json({
      success: true,
      questions,
      reviewStatus,
      message: `Successfully generated ${questions.length} questions`
    });
  } catch (error) {
    const invalidEvidence = error instanceof MiniQuizEvidenceError;
    // Log useful details without asking Next's dev logger to format an Error stack
    // (which was triggering the secondary invalid-source-map warnings).
    console.error('Mini quiz workflow failed:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      cause: error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined,
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate mini quiz',
        code: invalidEvidence ? 'INVALID_AO3_EVIDENCE' : 'QUIZ_GENERATION_FAILED',
        success: false
      },
      { status: invalidEvidence ? 422 : 500 }
    );
  } finally {
    // Attempt every deletion on success and failure, including partial uploads.
    await Promise.all(uploadedKeys.map(async (key) => {
      try {
        await deleteFromR2(key);
      } catch (error) {
        console.error(`Failed to delete temporary image ${key}:`, error);
      }
    }));
  }
}
