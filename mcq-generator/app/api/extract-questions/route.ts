// ENHANCED VERSION with improved extraction quality
import { NextRequest, NextResponse } from 'next/server';
import { MAPPER_EXTRACTION_VERSION } from '@/lib/topic-mapper-contract';

import { createMapperJob, mapperWorkerAvailable } from '@/lib/mapper-jobs';

export const runtime = 'nodejs';
export const maxDuration = 30;
const EXTRACTION_VERSION = MAPPER_EXTRACTION_VERSION;

const ALLOWED_ORIGINS = [
  'https://quizgenerator.pastpaperpal.co.uk',
  'http://localhost:3000',
];

function getCorsHeaders(req?: NextRequest) {
  const origin = req?.headers.get('origin') ?? '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-Extraction-Version",
    "X-Extraction-Version": EXTRACTION_VERSION,
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(req),
  });
}

// Lets operators verify the deployed extractor without uploading PDFs or
// spending tokens. Also present on POST responses, including failures.
export async function GET(req: NextRequest) {
  return NextResponse.json({ extractionVersion: EXTRACTION_VERSION, backgroundJobs: true, workerAvailable: await mapperWorkerAvailable() }, {
    headers: getCorsHeaders(req),
  });
}

// API Route Handler
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const pastPaperFile = formData.get('pastPaper') as File;
    const markSchemeFile = formData.get('markScheme') as File;

    if (!pastPaperFile || !markSchemeFile) {
      return NextResponse.json(
        { error: 'Both past paper and mark scheme PDFs are required' },
        {
          status: 400,
          headers: getCorsHeaders(req),
        }
      );
    }

    // Validate file types
    if (pastPaperFile.type !== 'application/pdf' || markSchemeFile.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Both files must be PDFs' },
        {
          status: 400,
          headers: getCorsHeaders(req),
        }
      );
    }

    // Validate file sizes (max 10MB each)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (pastPaperFile.size > maxSize || markSchemeFile.size > maxSize) {
      return NextResponse.json(
        { error: 'Files must be smaller than 10MB' },
        {
          status: 400,
          headers: getCorsHeaders(req),
        }
      );
    }

    if (!await mapperWorkerAvailable()) return NextResponse.json({ error: 'The mapper worker is unavailable. Please contact support to start it.' }, { status: 503, headers: getCorsHeaders(req) });
    const job = await createMapperJob({ kind: 'extraction' }, [pastPaperFile, markSchemeFile], req.headers.get('X-Mapper-Request-Id'));
    return NextResponse.json({ jobId: job.id, kind: job.kind, status: job.status }, { status: 202, headers: getCorsHeaders(req) });

  } catch (error: unknown) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to extract questions',
        details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
      },
      {
        status: 500,
        headers: getCorsHeaders(req),
      }
    );
  }
}
