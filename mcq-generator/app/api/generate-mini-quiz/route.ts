import { NextRequest, NextResponse } from 'next/server';
import { generateMiniQuiz } from '@/lib/openai';
import { uploadToR2, deleteFromR2, getSignedR2Url } from '@/lib/r2-client';
import { MiniQuizEvidenceError } from '@/lib/mini-quiz-errors';

export const runtime = 'nodejs';
export const maxDuration = 90;

export async function POST(request: NextRequest) {
  const uploadedKeys: string[] = [];

  try {
    const formData = await request.formData();
    // Preserve support for the original single-image request field.
    const entries = [...formData.getAll('images'), ...formData.getAll('image')];
    const educationLevel = formData.get('educationLevel') || "GCSE";
    if (educationLevel !== 'GCSE' && educationLevel !== 'A-LEVEL') {
      return NextResponse.json({ error: 'Education level must be GCSE or A-LEVEL' }, { status: 400 });
    }

    if (entries.length < 1 || entries.length > 2) {
      return NextResponse.json(
        { error: 'Mini Quiz requires 1 or 2 pages for the same quiz' },
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

    const signedUrls: string[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const key = await uploadToR2(buffer, file.name, file.type);
      // Track each upload before signing, so partial failures are cleaned up too.
      uploadedKeys.push(key);
      signedUrls.push(await getSignedR2Url(key));
    }

    const questions = await generateMiniQuiz(apiKey, signedUrls, educationLevel);
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
