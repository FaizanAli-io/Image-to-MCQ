import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { extractText } from 'unpdf';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ExtractedQuestion {
  question_id: string;
  text: string;
  mark_scheme: string;
}

// Extract text from PDF buffer using unpdf
async function extractPDFText(buffer: Buffer): Promise<string> {
  try {
    // Convert Buffer to Uint8Array (unpdf requirement)
    const uint8Array = new Uint8Array(buffer);
    const { text } = await extractText(uint8Array);
    // unpdf returns text as an array of strings, join them
    return Array.isArray(text) ? text.join('\n') : text;
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

// Use AI to structure questions and mark schemes
async function extractQuestionsWithAI(
  pastPaperText: string,
  markSchemeText: string
): Promise<ExtractedQuestion[]> {
  const systemPrompt = `You are a precise GCSE exam question extractor.

TASK: Extract questions from a past paper and match them with their mark schemes.

INPUT:
- Past paper text (contains questions)
- Mark scheme text (contains answers/marking points)

OUTPUT FORMAT: JSON object with "questions" array containing this EXACT structure:
{
  "questions": [
    {
      "question_id": "Q1a",
      "text": "Full question text here",
      "mark_scheme": "Marking points from mark scheme"
    }
  ]
}

CRITICAL RULES:
1. QUESTION IDs:
   - Use format from paper (e.g., "Q1a", "Q1b", "Q2a", "1.1", "2(a)")
   - If no IDs in paper, use sequential: "Q1", "Q2", "Q3"
   - NEVER invent IDs - extract exactly as shown

2. QUESTION TEXT:
   - Include FULL question including all parts
   - Include any data given (e.g., "The Mr of Fe2O3 is 160")
   - Include choices for multiple choice (A, B, C, D)
   - Keep formatting cues like "(HT only)", "[2 marks]"

3. MARK SCHEME:
   - Match mark scheme to corresponding question
   - Include ALL marking points for that question
   - Keep technical terminology exact
   - Include alternative acceptable answers if given

4. SUB-QUESTIONS:
   - Treat each lettered part as separate question
   - E.g., "1(a)" and "1(b)" are TWO entries
   - Each gets its own mark scheme

5. QUALITY CHECKS:
   - Every question MUST have a mark_scheme
   - question_id MUST be unique
   - No empty fields
   - Maintain question order from paper

EXAMPLE OUTPUT:
{
  "questions": [
    {
      "question_id": "Q1a",
      "text": "Describe the structure of an atom.",
      "mark_scheme": "Atoms have a nucleus containing protons and neutrons, with electrons orbiting in shells. (Any 2 points for 2 marks)"
    },
    {
      "question_id": "Q1b",
      "text": "Calculate the relative formula mass of water (H2O). Relative atomic masses: H = 1, O = 16",
      "mark_scheme": "(1 × 2) + 16 = 18. Award 1 mark for working, 1 mark for correct answer."
    }
  ]
}

Return ONLY valid JSON object with "questions" key. No preamble, no explanation.`;

  const userPrompt = `PAST PAPER TEXT:
${pastPaperText.slice(0, 50000)}

---

MARK SCHEME TEXT:
${markSchemeText.slice(0, 50000)}

Extract all questions with their mark schemes as JSON object with "questions" array.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0
  });

  const content = completion.choices[0].message.content!;

  // Parse response - handle both direct array and wrapped object
  let parsed;
  try {
    parsed = JSON.parse(content);
    
    // Log the parsed structure for debugging
    console.log('Parsed JSON structure:', Object.keys(parsed));
    
    // If wrapped in object like {questions: [...]}
    if (!Array.isArray(parsed) && parsed.questions) {
      parsed = parsed.questions;
    }
    // Try other common wrapper keys
    else if (!Array.isArray(parsed) && parsed.data) {
      parsed = parsed.data;
    }
    else if (!Array.isArray(parsed) && parsed.results) {
      parsed = parsed.results;
    }
    // If still not array, try to extract first value
    else if (!Array.isArray(parsed)) {
      const values = Object.values(parsed);
      if (values.length > 0 && Array.isArray(values[0])) {
        parsed = values[0];
      }
    }
  } catch (e) {
    console.error('JSON parse error:', e);
    console.error('Raw content:', content);
    throw new Error('Failed to parse AI response as JSON');
  }

  // Validate structure
  if (!Array.isArray(parsed)) {
    console.error('Parsed result is not an array:', typeof parsed, parsed);
    throw new Error('AI did not return a valid array of questions');
  }

  if (parsed.length === 0) {
    throw new Error('AI returned an empty array of questions');
  }

  const questions: ExtractedQuestion[] = parsed.map((q: any, index: number) => {
    if (!q.question_id || !q.text || !q.mark_scheme) {
      console.error(`Invalid question at index ${index}:`, q);
      throw new Error(`Invalid question structure at index ${index} - missing required fields`);
    }
    
    return {
      question_id: String(q.question_id).trim(),
      text: String(q.text).trim(),
      mark_scheme: String(q.mark_scheme).trim()
    };
  });

  return questions;
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
        { status: 400 }
      );
    }

    // Validate file types
    if (pastPaperFile.type !== 'application/pdf' || markSchemeFile.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Both files must be PDFs' },
        { status: 400 }
      );
    }

    // Convert files to buffers
    const pastPaperBuffer = Buffer.from(await pastPaperFile.arrayBuffer());
    const markSchemeBuffer = Buffer.from(await markSchemeFile.arrayBuffer());

    // Extract text from PDFs
    console.log('Extracting text from PDFs...');
    const pastPaperText = await extractPDFText(pastPaperBuffer);
    const markSchemeText = await extractPDFText(markSchemeBuffer);

    if (!pastPaperText || !markSchemeText) {
      return NextResponse.json(
        { error: 'Failed to extract text from one or both PDFs' },
        { status: 400 }
      );
    }

    // Use AI to extract and structure questions
    console.log('Extracting questions with AI...');
    const questions = await extractQuestionsWithAI(pastPaperText, markSchemeText);

    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'No questions found in the provided PDFs' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      questions,
      count: questions.length,
      message: `Successfully extracted ${questions.length} questions`
    });

  } catch (error: any) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to extract questions' },
      { status: 500 }
    );
  }
}
