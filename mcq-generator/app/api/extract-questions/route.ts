// ENHANCED VERSION with improved extraction quality
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { readMapperPdf } from '@/lib/mapper-pdf';
import type { MapperSourceQuestion } from '@/lib/mapper-source';
import type { SourceMarkingRow } from '@/lib/mapper-mark-scheme';
import { matchSourceMarkingRows } from '@/lib/mapper-source-extraction';
import { MAPPER_EXTRACTION_VERSION } from '@/lib/topic-mapper-contract';
import { extractQuestionBatches, type ExtractedQuestion } from '@/lib/question-extraction';

export const maxDuration = 300;
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
  return NextResponse.json({ extractionVersion: EXTRACTION_VERSION }, {
    headers: getCorsHeaders(req),
  });
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ENHANCED: Better prompt with clearer instructions
async function extractQuestionsWithAI(
  pastPaperText: string,
  markSchemeText: string,
  sourceQuestions: MapperSourceQuestion[] | null,
  sourceMarkingRows: SourceMarkingRow[] | null,
): Promise<ExtractedQuestion[]> {
  const systemPrompt = `You are an expert exam question extractor with high precision.

TASK: Extract ALL questions beginning in the requested TARGET SECTION and match them with their corresponding mark schemes. Use the rest of the paper only as context to complete those questions.

OUTPUT FORMAT: Return ONLY a JSON object with this EXACT structure:
{
  "questions": [
    {
      "question_id": "Q1a",
      "text": "Complete question text here",
      "mark_scheme": "Complete marking points here"
    }
  ]
}

CRITICAL EXTRACTION RULES:

1. QUESTION IDs - EXTRACT EXACTLY AS SHOWN:
   ✓ Use exact format from paper: "Q1a", "Q1b", "Q2a", "1(a)", "1.1", etc.
   ✓ If paper uses "Question 01 (a)" → extract as "Q1a"
   ✓ Maintain consistent format throughout
   ✓ NEVER skip or combine question parts
   ✓ Each lettered part (a, b, c) is a SEPARATE question

2. QUESTION TEXT - INCLUDE EVERYTHING:
   ✓ Full question stem and all parts
   ✓ ALL data given (e.g., "Ar: H=1, O=16", "Mr: CuSO4=159.5")
   ✓ ALL options for multiple choice (A, B, C, D)
   ✓ Any diagrams/figures referenced (e.g., "Use Figure 1")
   ✓ Mark allocations (e.g., "(2)", "[3 marks]")
   ✓ Special indicators (e.g., "(HT only)", "(chemistry only)")
   ✓ Tick boxes indicators (e.g., "Tick (✓) one box")
   ✓ Answer spaces/blanks (e.g., "______ g", "______ %")
   
   FORMAT EXAMPLES:
   ✓ "Calculate the relative formula mass (Mr) of CuSO4. Ar: Cu=63.5, S=32, O=16. Mr = ______ (2)"
   ✓ "Which metal is copper? Tick (✓) one box. A B C D (1)"

3. MARK SCHEME - COMPLETE MARKING POINTS:
   ✓ Include ALL acceptable answers
   ✓ Keep exact marking notation (e.g., "1" for 1 mark, "M1" for method mark)
   ✓ Include alternatives (e.g., "allow...", "or...", "accept...")
   ✓ Keep mark allocation structure (e.g., "1 mark for X, 1 mark for Y")
   ✓ Preserve calculation steps if shown
   ✓ Include "do not accept" / "ignore" instructions
   
   EXAMPLES:
   ✓ "= 39.8 % allow answer correctly rounded to 3 sf from incorrect calculation 1"
   ✓ "(copper) does not react with acid allow unreactive allow below hydrogen 1"

4. SUB-QUESTIONS - TREAT SEPARATELY:
   ✓ "1(a)" and "1(b)" = TWO separate entries
   ✓ Each sub-question gets its own complete text
   ✓ Each sub-question gets its own mark scheme
   ✓ Maintain parent question context if needed

5. COMPLEX QUESTIONS:
   ✓ For questions with tables: describe table structure
   ✓ For graph questions: mention "Use the graph" or "Plot on Figure X"
   ✓ For calculations: include ALL given values and units
   ✓ For balancing equations: show the unbalanced equation

6. QUALITY CHECKS (NEVER violate these):
   ✗ No empty question_id, text, or mark_scheme
   ✗ No duplicate question_ids
   ✗ No merged sub-questions
   ✗ No truncated text
   ✗ No missing mark allocations
   ✗ No incorrect question-answer pairings

EXAMPLE OF PERFECT EXTRACTION:

INPUT (Past Paper):
"Question 1b
Calculate the percentage (%) by mass of copper in copper sulfate (CuSO4).
Give your answer to 3 significant figures.
Relative atomic mass (Ar): Cu = 63.5
Relative formula mass (Mr): CuSO4 = 159.5
Percentage by mass (3 significant figures) = _______ %
(3)"

INPUT (Mark Scheme):
"1b = 39.81191 (%) 1
= 39.8 % allow an answer correctly rounded to 3 significant figures from an incorrect calculation which uses both the values in the question 1"

CORRECT OUTPUT:
{
  "question_id": "Q1b",
  "text": "Calculate the percentage (%) by mass of copper in copper sulfate (CuSO4). Give your answer to 3 significant figures. Relative atomic mass (Ar): Cu = 63.5 Relative formula mass (Mr): CuSO4 = 159.5 Percentage by mass (3 significant figures) = _______ % (3)",
  "mark_scheme": "= 39.81191 (%) 1 = 39.8 % allow an answer correctly rounded to 3 significant figures from an incorrect calculation which uses both the values in the question 1"
}

REMEMBER: Your job is to extract and match, NOT to interpret or simplify. Preserve ALL original content.`;

  try {
    const questionsArray = sourceQuestions && sourceMarkingRows
      ? await matchSourceMarkingRows(openai, sourceQuestions, sourceMarkingRows)
      : await extractQuestionBatches(openai, systemPrompt, pastPaperText, markSchemeText, sourceQuestions);

    // ENHANCED: Validate and clean each question
    const questions: ExtractedQuestion[] = [];
    const seenIds = new Set<string>();

    for (const q of questionsArray) {
      // Validate required fields
      if (!q.question_id || !q.text) {
        console.warn('Skipping invalid question:', q);
        continue;
      }

      // Clean and normalize
      const cleanQuestion: ExtractedQuestion = {
        ...q,
        question_id: String(q.question_id).trim(),
        text: String(q.text).trim(),
        mark_scheme: String(q.mark_scheme ?? '').trim(),
        ...(!sourceQuestions ? { extraction_review: [q.extraction_review, 'Source coverage could not be verified for this PDF layout. Check question parts and totals against the paper.'].filter(Boolean).join(' ') } : {}),
      };

      // A boundary question can be repeated by the model. Do not invent IDs.
      if (seenIds.has(cleanQuestion.question_id)) {
        const existing = questions.find(q => q.question_id === cleanQuestion.question_id)!;
        const markScheme = cleanQuestion.mark_scheme || '[Mark scheme not extracted - manual review required]';
        if (existing.text === cleanQuestion.text && existing.mark_scheme === markScheme) continue;
        throw new Error(`Conflicting extracted entries for ${cleanQuestion.question_id}. Please extract a smaller paper section to preserve the original question IDs.`);
      }

      // Additional validation
      if (cleanQuestion.text.length === 0) {
        console.warn('Question text too short:', cleanQuestion.question_id);
        continue;
      }

      // Keep question visible for mapping/manual review even if mark scheme extraction is weak.
      if (cleanQuestion.mark_scheme.length === 0) {
        cleanQuestion.mark_scheme = '[Mark scheme not extracted - manual review required]';
      }

      seenIds.add(cleanQuestion.question_id);
      questions.push(cleanQuestion);
    }

    if (questions.length === 0) {
      throw new Error('No valid questions extracted after validation');
    }

    return questions;

  } catch (error: unknown) {
    console.error('AI extraction error:', error);
    throw new Error(`AI extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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

    // Convert files to buffers
    const pastPaperBuffer = Buffer.from(await pastPaperFile.arrayBuffer());
    const markSchemeBuffer = Buffer.from(await markSchemeFile.arrayBuffer());

    // Extract text from PDFs
    console.log('Extracting text from PDFs...');
    const [paper, markScheme] = await Promise.all([
      readMapperPdf(pastPaperBuffer, true),
      readMapperPdf(markSchemeBuffer)
    ]);
    const pastPaperText = paper.text;
    const markSchemeText = markScheme.text;

    // Validate extracted text
    if (!pastPaperText || pastPaperText.trim().length < 100) {
      return NextResponse.json(
        { error: 'Past paper PDF appears to be empty or unreadable' },
        {
          status: 400,
          headers: getCorsHeaders(req),
        }
      );
    }

    if (!markSchemeText || markSchemeText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Mark scheme PDF appears to be empty or unreadable' },
        {
          status: 400,
          headers: getCorsHeaders(req),
        }
      );
    }

    // Extract and structure questions
    console.log('Extracting questions with AI...');
    const questions = await extractQuestionsWithAI(pastPaperText, markSchemeText, paper.sourceQuestions, markScheme.sourceMarkingRows);

    // Return with metadata
    return NextResponse.json({
      success: true,
      questions,
      count: questions.length,
      metadata: {
        extractionVersion: EXTRACTION_VERSION,
        sourceCoverage: paper.sourceQuestions ? 'source-inventory' : 'ai-extraction',
        pastPaperLength: pastPaperText.length,
        markSchemeLength: markSchemeText.length,
        extractedAt: new Date().toISOString()
      },
      message: `Successfully extracted ${questions.length} questions`
    }, {
      headers: getCorsHeaders(req)
    });

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
