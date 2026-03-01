import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Types
interface Question {
  question_id: string;
  text: string;
  mark_scheme?: string;
}

interface TopicEntry {
  Code: string;
  Name: string;
  'Learning Outcomes': string;
  Description: string;
}

interface QuestionMapping {
  question_id: string;
  primary_topic: string | null;
  secondary_topic: string | null;
  reason: string;
  needs_review: boolean;
  review_reason: string | null;
}

// Data manipulation detection
const CALC_KEYWORDS = [
  'calculate', 'work out', 'determine the', 'find the value',
  'use the graph', 'from the table', 'find the mean',
  'percentage', 'convert', 'significant figures', 'gradient'
];

const NUMERICAL_PATTERNS = [
  /\btable\s+\d+/i,
  /\bfigure\s+\d+/i,
  /\d+\.?\d*\s*(g|kg|mol|dm3|°C)/,
];

function isDataManipulation(text: string): boolean {
  const lower = text.toLowerCase();
  return CALC_KEYWORDS.some(k => lower.includes(k)) ||
         NUMERICAL_PATTERNS.some(p => p.test(text));
}

// Build topic reference
function buildTopicRef(topics: TopicEntry[]): string {
  let ref = '=== AVAILABLE TOPICS ===\n\n';
  for (const t of topics) {
    ref += `CODE: ${t.Code}\nNAME: ${t.Name}\n`;
    ref += `STUDENTS SHOULD BE ABLE TO: ${t['Learning Outcomes']}\n`;
    ref += `DESCRIPTION: ${t.Description}\n\n`;
  }
  return ref;
}

// Map single question
async function mapQuestion(q: Question, topics: TopicEntry[]): Promise<QuestionMapping> {
  const qid = q.question_id;
  
  // Check data manipulation
  if (isDataManipulation(q.text)) {
    return {
      question_id: qid,
      primary_topic: null,
      secondary_topic: null,
      reason: "Data manipulation / calculation question - manual mapping required",
      needs_review: true,
      review_reason: "calculation_detected"
    };
  }
  
  // Build prompt
  const topicRef = buildTopicRef(topics);
  const systemPrompt = `You are a GCSE Chemistry topic classifier.

${topicRef}

RULES:
1. Use exact question_id provided
2. Choose ONE primary_topic code
3. Add secondary_topic only if clear dual mapping
4. Match mark scheme to spec descriptions
5. needs_review=true only if secondary_topic OR unclear
6. Use ONLY codes from list

Return JSON: {question_id, primary_topic, secondary_topic, reason, needs_review, review_reason}`;

  const userContent = `Question ID: ${qid}\nQUESTION: ${q.text}${
    q.mark_scheme ? `\nMARK SCHEME: ${q.mark_scheme}` : ''
  }`;
  
  // Call OpenAI
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    response_format: { type: 'json_object' },
    temperature: 0
  });
  
  const result = JSON.parse(completion.choices[0].message.content!) as QuestionMapping;
  result.question_id = qid; // Force match
  
  // Validate
  const validCodes = topics.map(t => t.Code.trim());
  if (result.primary_topic && !validCodes.includes(result.primary_topic.trim())) {
    result.needs_review = true;
    result.review_reason = "invalid_topic_code";
  }
  
  return result;
}

// API Route Handler
export async function POST(req: NextRequest) {
  try {
    const { questions, topics } = await req.json() as { 
      questions: Question[], 
      topics: TopicEntry[] 
    };
    
    if (!questions || !topics) {
      return NextResponse.json(
        { error: 'Missing questions or topics' },
        { status: 400 }
      );
    }
    
    // Map all questions
    const results: QuestionMapping[] = [];
    for (const q of questions) {
      const mapping = await mapQuestion(q, topics);
      results.push(mapping);
    }
    
    // Calculate stats
    const stats = {
      total: results.length,
      dataManipulation: results.filter(r => r.review_reason === 'calculation_detected').length,
      dualTopics: results.filter(r => r.secondary_topic !== null).length,
      needsReview: results.filter(r => r.needs_review).length,
      cleanMappings: results.filter(r => !r.needs_review && r.primary_topic !== null).length
    };
    
    return NextResponse.json({ results, stats });
    
  } catch (error: any) {
    console.error('Mapping error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
