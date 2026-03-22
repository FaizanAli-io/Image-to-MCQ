// ENHANCED VERSION - Based on Python mapping logic
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';


const corsHeaders = {
  "Access-Control-Allow-Origin":
    "https://quizgenerator.pastpaperpal.co.uk",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

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
  topic_name: string;
  secondary_topic: string | null;
  reason: string;
  needs_review: boolean;
  review_reason: string | null;
}

// ENHANCED: Comprehensive calculation and data manipulation detection
const CALC_KEYWORDS = [
  // Direct calculation commands
  'calculate',
  'work out',
  'determine the',
  'find the value',
  'find the volume',
  'find the mass',
  'find the number of moles',
  'show that',
  'using the equation',
  'what is the mass',
  'what is the volume',
  'how many moles',

  // Data manipulation
  'use the graph',
  'from the graph',
  'use the table',
  'from the table',
  'use the data',
  'from the data',
  'calculate the gradient',
  'calculate the slope',
  'find the gradient',
  'find the slope',
  'determine the rate',
  'calculate the rate',

  // Statistical operations
  'find the mean',
  'calculate the mean',
  'find the average',
  'calculate the average',
  'find the range',
  'calculate the range',
  'percentage by mass',
  'percentage increase',
  'percentage decrease',
  'percentage change',

  // Mathematical operations
  'substitute',
  'convert',
  'convert to',
  'change to',
  'significant figures',
  'standard form',
  'ratio of'
];

// ENHANCED: Numerical patterns that indicate data manipulation
const NUMERICAL_INDICATORS = [
  /\btable\s+\d+/i,           // "Table 1", "table 2"
  /\bfigure\s+\d+/i,          // "Figure 1"
  /\bgraph\s+\d+/i,           // "Graph 1"
  /\d+\.?\d*\s*(g|kg|mol|dm3|dm³|cm3|cm³|°C|K|kJ|J|Pa|atm|%)/i,  // Numbers with units
  /\d+\.?\d*\s*×\s*10/i,      // Scientific notation
  /=\s*\d+/,                  // Equals sign with number
  /\d+\.?\d*\s*[+\-×÷/]\s*\d+/  // Arithmetic operations
];

function hasNumericalIndicators(text: string): boolean {
  return NUMERICAL_INDICATORS.some(pattern => pattern.test(text));
}

function isDataManipulationQuestion(text: string): boolean {
  /**
   * CRITICAL: Detect ANY question involving numerical manipulation of data
   * Returns True if question involves:
   * - Calculations
   * - Graph analysis (gradient, rate, reading values)
   * - Table data manipulation
   * - Mean, range, percentage calculations
   * - Unit conversions
   * - Significant figures
   * - Any numeric data interpretation
   * 
   * These questions are NOT sent to AI - flagged for manual review immediately
   */
  const textLower = text.toLowerCase();

  // Check for calculation/manipulation keywords
  const hasManipulationKeyword = CALC_KEYWORDS.some(keyword =>
    textLower.includes(keyword)
  );

  // Check for numerical indicators (graphs, tables, units, numbers)
  const hasNumericalData = hasNumericalIndicators(text);

  // Flag if EITHER condition is true (more aggressive detection)
  return hasManipulationKeyword || hasNumericalData;
}

// ENHANCED: Build comprehensive topic reference
function buildTopicReference(topics: TopicEntry[]): string {
  let reference = '=== AVAILABLE TOPICS ===\n\n';

  for (const topic of topics) {
    const code = topic.Code.trim();
    reference += `CODE: ${code}\n`;
    reference += `NAME: ${topic.Name}\n`;

    if (topic['Learning Outcomes']) {
      reference += `STUDENTS SHOULD BE ABLE TO: ${topic['Learning Outcomes']}\n`;
    }

    reference += `DESCRIPTION: ${topic.Description}\n\n`;
  }

  return reference;
}

// ENHANCED: Few-shot examples showing correct primary/secondary topic usage
const FEW_SHOT_EXAMPLES = [
  {
    question: "Pure iron is too soft for many uses. Explain why mixing iron with other metals makes alloys which are harder than pure iron.",
    mark_scheme: "(the alloy / mixture has) different sized atoms (so the) layers are distorted (so the) layers cannot easily slide. Allow (positive / metal) ions for atoms throughout. Allow (so the) atoms cannot slide over each other.",
    answer: {
      question_id: "example1",
      primary_topic: "4.2.2.7",
      topic_name: "Properties of metals and alloys",
      secondary_topic: null,
      reason: "The question and mark scheme focus on why alloys are harder than pure metals, specifically mentioning distortion of layers due to different sized atoms, which aligns with the properties of metals and alloys topic.",
      needs_review: false,
      review_reason: null
    }
  },
  {
    question: "Evaluate the use of aluminium, copper and silver for electrical wires (overhead cables, house wiring, circuit boards). Use data for electrical conductivity, density, and cost.",
    mark_scheme: "Relevant points: silver is the best electrical conductor; aluminium is the least dense and least expensive; copper is better than aluminium but cheaper than silver. Judgements: Use aluminium for overhead wires (low density/cost); use copper for domestic wiring (good conductor/affordable); use silver only for small items like circuit boards due to high cost.",
    answer: {
      question_id: "example2",
      primary_topic: "4.2.2.8",
      topic_name: "Metals as conductors",
      secondary_topic: "WS 1.4",
      reason: "Primary: Metals as conductors (4.2.2.8) because the question evaluates electrical conductivity of metals. Secondary: Working Scientifically - applications of science (WS 1.4) as it involves evaluating materials for specific uses based on properties and cost.",
      needs_review: true,
      review_reason: "dual_topic"
    }
  }
];

// ENHANCED: Map single question with comprehensive validation
async function mapQuestion(
  question: Question,
  topics: TopicEntry[]
): Promise<QuestionMapping> {
  const questionId = question.question_id;

  // 1. DETECT DATA MANIPULATION QUESTIONS - DO NOT SEND TO AI
  if (isDataManipulationQuestion(question.text)) {
    return {
      question_id: questionId,
      primary_topic: null,
      topic_name: "",
      secondary_topic: null,
      reason: "Data manipulation / calculation question - manual mapping required",
      needs_review: true,
      review_reason: "calculation_detected"
    };
  }

  // 2. BUILD USER PROMPT with question AND mark scheme
  let userContent = `Question ID: ${questionId}\n\nQUESTION: ${question.text}`;

  if (question.mark_scheme) {
    userContent += `\n\nMARK SCHEME: ${question.mark_scheme}`;
  }

  // 3. BUILD TOPIC REFERENCE
  const topicReference = buildTopicReference(topics);

  // 4. BUILD SYSTEM PROMPT with enhanced instructions
  const systemPrompt = `You are a precise GCSE Chemistry topic classifier.

${topicReference}

CRITICAL RULES:

1. QUESTION ID: Use the exact question_id provided in the user message. NEVER generate or modify it.

2. PRIMARY TOPIC: Choose the ONE best matching topic code from the list above.

3. TOPIC NAME: For validation purposes, include the topic name corresponding to the primary topic code from the list above.

4. SECONDARY TOPIC: Only include if the question has CLEAR overlap between TWO spec areas.
   - Use sparingly - most questions have only one topic
   - Examples: practical investigation + content topic, working scientifically + specific chemistry concept
   - If you add secondary_topic, this will automatically flag needs_review

5. MATCHING STRATEGY:
   - Match mark scheme keywords to spec descriptions
   - Use "Students should be able to" learning outcomes
   - Look for exact terminology from specification
   - Consider both question AND mark scheme text

6. NEEDS REVIEW: Set to true ONLY if:
   - secondary_topic exists (automatic)
   - Strong overlap between multiple spec points is unclear
   - Question could reasonably map to 2+ topics

7. Use ONLY codes that exist in the available topics list above.

Return JSON with: question_id, primary_topic, topic_name, secondary_topic, reason, needs_review, review_reason`;

  // 5. BUILD MESSAGES with few-shot examples
  const messages: any[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Add few-shot examples
  for (const example of FEW_SHOT_EXAMPLES) {
    messages.push({
      role: 'user',
      content: `Question ID: ${example.answer.question_id}\n\nQUESTION: ${example.question}\n\nMARK SCHEME: ${example.mark_scheme}`
    });

    const secondaryTopic = example.answer.secondary_topic
      ? `"${example.answer.secondary_topic}"`
      : 'null';
    const reviewReason = example.answer.review_reason
      ? `"${example.answer.review_reason}"`
      : 'null';

    messages.push({
      role: 'assistant',
      content: JSON.stringify({
        question_id: example.answer.question_id,
        primary_topic: example.answer.primary_topic,
        topic_name: example.answer.topic_name,
        secondary_topic: example.answer.secondary_topic,
        reason: example.answer.reason,
        needs_review: example.answer.needs_review,
        review_reason: example.answer.review_reason
      })
    });
  }

  // Add actual question
  messages.push({
    role: 'user',
    content: userContent
  });

  // 6. GET STRUCTURED RESPONSE
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    response_format: { type: 'json_object' },
    temperature: 0
  });

  const result = JSON.parse(completion.choices[0].message.content!) as QuestionMapping;

  // 7. VALIDATE AND NORMALIZE (Pydantic @model_validator equivalent)
  return validateQuestionMapping(result, questionId, topics);
}

// ENHANCED: Validate and normalize QuestionMapping (similar to Pydantic @model_validator)
/**
 * Validates and normalizes a QuestionMapping result
 * Implements the same logic as Python's Pydantic @model_validator(mode='after')
 * 
 * Key validations:
 * 1. Forces question_id to match input (never trust AI)
 * 2. Populates topic_name from primary_topic code
 * 3. Validates topic codes against available topics
 * 4. Detects ambiguous language in reasoning
 * 5. Auto-flags secondary_topic for review (Pydantic behavior)
 * 6. Ensures all review reasons are set correctly
 */
function validateQuestionMapping(
  result: QuestionMapping,
  questionId: string,
  topics: TopicEntry[]
): QuestionMapping {
  // 1. CRITICAL: Ensure question_id matches input (override if AI modified it)
  result.question_id = questionId;

  // 2. Get valid codes and topic names
  const validCodes = topics.map(t => t.Code.trim());
  const topicMap = new Map(topics.map(t => [t.Code.trim(), t.Name]));

  // 3. Normalize codes
  if (result.primary_topic) {
    result.primary_topic = result.primary_topic.trim();
  }
  if (result.secondary_topic) {
    result.secondary_topic = result.secondary_topic.trim();
  }

  // 4. Ensure topic_name is populated from primary_topic
  if (result.primary_topic && topicMap.has(result.primary_topic)) {
    result.topic_name = topicMap.get(result.primary_topic)!;
  } else if (!result.topic_name) {
    result.topic_name = "";
  }

  // 5. Check primary topic validity
  if (result.primary_topic && !validCodes.includes(result.primary_topic)) {
    result.needs_review = true;
    result.review_reason = "invalid_topic_code";
  }

  // 6. Check secondary topic validity
  if (result.secondary_topic && !validCodes.includes(result.secondary_topic)) {
    result.needs_review = true;
    result.review_reason = "invalid_topic_code";
  }

  // 7. Check for ambiguous language in reason
  const reasonLower = result.reason.toLowerCase();
  const ambiguousPhrases = [
    "could be", "might be", "possibly", "unclear",
    "ambiguous", "overlaps with"
  ];

  if (ambiguousPhrases.some(phrase => reasonLower.includes(phrase))) {
    result.needs_review = true;
    if (!result.review_reason) {
      result.review_reason = "multiple_overlap";
    }
  }

  // 8. Flag if no topic assigned
  if (!result.primary_topic) {
    result.needs_review = true;
    if (!result.review_reason) {
      result.review_reason = "no_topic_assigned";
    }
  }

  // 9. AUTO-FLAG if secondary topic exists (Pydantic @model_validator behavior)
  if (result.secondary_topic) {
    result.needs_review = true;
    if (!result.review_reason) {
      result.review_reason = "dual_topic";
    }
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

    if (!questions || !Array.isArray(questions)) {
      return NextResponse.json(
        { error: "Missing or invalid questions array" },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    if (!topics || !Array.isArray(topics)) {
      return NextResponse.json(
        { error: "Missing or invalid topics array" },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    console.log(
      `Mapping ${questions.length} questions to topics...`
    );

    const results: QuestionMapping[] = [];

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];

      console.log(
        `Mapping question ${i + 1}/${questions.length}: ${question.question_id}`
      );

      try {
        const mapping = await mapQuestion(
          question,
          topics
        );

        results.push(mapping);

      } catch (error: any) {
        console.error(
          `Error mapping question ${question.question_id}:`,
          error
        );

        results.push({
          question_id: question.question_id,
          primary_topic: null,
          topic_name: "",
          secondary_topic: null,
          reason: `Mapping failed: ${error.message}`,
          needs_review: true,
          review_reason: "mapping_error",
        });
      }
    }

    const stats = {
      total: results.length,
      dataManipulation: results.filter(
        r => r.review_reason ===
          "calculation_detected"
      ).length,
      dualTopics: results.filter(
        r => r.secondary_topic !== null
      ).length,
      needsReview: results.filter(
        r => r.needs_review
      ).length,
      cleanMappings: results.filter(
        r =>
          !r.needs_review &&
          r.primary_topic !== null
      ).length,
      invalidCodes: results.filter(
        r => r.review_reason ===
          "invalid_topic_code"
      ).length,
      multipleOverlap: results.filter(
        r => r.review_reason ===
          "multiple_overlap"
      ).length,
      noTopicAssigned: results.filter(
        r => r.review_reason ===
          "no_topic_assigned"
      ).length,
      mappingErrors: results.filter(
        r => r.review_reason ===
          "mapping_error"
      ).length,
    };

    console.log(
      "Mapping complete:",
      stats
    );

    return NextResponse.json(
      {
        success: true,
        results,
        stats,
      },
      {
        headers: corsHeaders,
      }
    );

  } catch (error: any) {
    console.error(
      "Mapping error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error.message ||
          "Failed to map questions",
        details:
          process.env.NODE_ENV ===
            "development"
            ? error.stack
            : undefined,
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}
