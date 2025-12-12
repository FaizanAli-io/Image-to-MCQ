import { NextRequest, NextResponse } from 'next/server';
import { generateStructuredQuestions, generateAndShuffleRetrievalQuiz } from '@/lib/openai';
import { GenerateQuestionsRequest, GeneratedQuestion } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    console.log("\n" + "=".repeat(60));
    console.log("🎯 API ROUTE: /api/generate-questions");
    console.log("=".repeat(60));

    const body: GenerateQuestionsRequest = await request.json();
    const { imageBase64, config, customPrompt } = body;


    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("❌ API key not configured!");
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }
    console.log("✅ API key found");

    // Handle retrieval quiz using demo workflow
    if (config.quizType === "retrieval") {
      // Validate we have exactly 3 images
      if (!Array.isArray(imageBase64) || imageBase64.length !== 3) {
        return NextResponse.json(
          { error: 'Retrieval quiz requires exactly 3 images' },
          { status: 400 }
        );
      }

      console.log("🚀 Using demo workflow for retrieval quiz generation...");

      // Generate and shuffle the complete quiz using demo workflow
      const result = await generateAndShuffleRetrievalQuiz(
        apiKey,
        imageBase64 as [string, string, string],
        config.educationLevel
      );

      console.log("✅ Successfully generated and shuffled retrieval quiz");
      console.log(`📊 Total: ${result.questions.length} questions`);
      console.log(`🎲 Original answer key: ${result.originalAnswerKey.join('')}`);
      console.log(`🎲 Shuffled answer key: ${result.shuffledAnswerKey.join('')}`);
      console.log("=".repeat(60) + "\n");

      return NextResponse.json({ 
        questions: result.questions,
        originalAnswerKey: result.originalAnswerKey,
        shuffledAnswerKey: result.shuffledAnswerKey
      });
    }

    // Build comprehensive prompt based on quiz type
    let prompt = customPrompt;
    
    if (!prompt) {
      const level = config.educationLevel; // "GCSE" or "A-LEVEL"
      const levelDisplay = config.educationLevel === "GCSE" ? "GCSE" : "A-Level";
      
      switch (config.quizType) {
        // Retrieval quiz is handled above with concurrent processing
        /* case "retrieval":
          prompt = `You are generating a ready-to-use ${levelDisplay} retrieval quiz. Treat this as a final deliverable that students can use immediately.

🔹 FORMAT REQUIREMENTS:
- Title at the top: "Retrieval Quiz – [INSERT DATE]"
- Plain text only (no markdown, tables, or images)
- Total of 30 multiple-choice questions, divided into 3 topics, with 10 questions per topic
- Use these headings, based on the submitted revision-guide images:
  * Topic A: [revised last week, first picture]
  * Topic B: [revised 2–3 weeks ago, second picture]
  * Topic C: [revised 4+ weeks ago, third picture]

🔹 QUESTION STRUCTURE:
Each topic must include:
- 5 AO1 questions (recall of facts/content) - questions 1-5
- 5 AO2 questions (application/data/one-sentence cause-effect reasoning) - questions 6-10

Each question must:
- Be multiple choice with 1 correct answer + 3 plausible distractors
- Be short and answerable in under 30 seconds
- Have only one unambiguously correct answer
- Use distractors that reflect real misconceptions, not obviously incorrect ideas and test their deep conceptual understanding of the topic

🔹 DISTRACTOR REQUIREMENTS:
Each incorrect option (distractor) MUST be plausible and test deep understanding.

EXAMPLES OF GOOD DISTRACTORS (plausible, test understanding):

✓ Confusing Similar Terms:
Question: "Which process produces gametes?"
- Correct: Meiosis
- Good distractor: Mitosis (students often confuse these)
- Good distractor: Binary fission (similar process, wrong context)
- Good distractor: Budding (another reproduction method)

✓ Reversing Cause and Effect:
Question: "What is produced during photosynthesis?"
- Correct: Glucose and oxygen
- Good distractor: Carbon dioxide and water (these are INPUTS, not outputs)
- Good distractor: ATP only (partially correct but incomplete)
- Good distractor: Starch only (product of glucose, not direct product)

✓ Correct Fact, Wrong Context:
Question: "Which organelle is responsible for energy production?"
- Correct: Mitochondria
- Good distractor: Ribosomes (correct organelle, wrong function)
- Good distractor: Chloroplasts (produces energy but only in plants via photosynthesis)
- Good distractor: Nucleus (controls cell but doesn't produce energy)

✓ Common Student Misconceptions:
Question: "Do plants respire?"
- Correct: Yes, all the time
- Good distractor: No, they only photosynthesize (common misconception!)
- Good distractor: Only at night (partially correct understanding)
- Good distractor: Only when not photosynthesizing (another misconception)

✗ EXAMPLES OF BAD DISTRACTORS (obviously wrong, don't use):
- Completely unrelated: "The moon orbits Earth" (when asking about cell biology)
- Nonsense words: "Flibbertigibbet organelle" or "Quantum mitochondria"
- Grammatically incorrect: "Cell do the thing" or "Photosynthesis are happen"
- Absurd answers: "Mitochondria play football" or "Cells eat pizza"
- Obviously false: "Plants are made of metal" or "DNA is liquid"

CRITICAL: Every distractor must be something a student with partial understanding might genuinely believe. If a distractor is obviously wrong at first glance, it's a bad distractor.

🔹 AO2 QUESTION REQUIREMENTS:
AO2 questions (questions 6–10 in each topic) MUST test application, not just recall.

EXAMPLES OF GOOD AO2 QUESTIONS:

✓ Application to Unfamiliar Scenarios:
"A student finds a plant cell under a microscope in a pond sample. Which feature would confirm it's a plant cell not an animal cell?"
a) Cell membrane
b) Nucleus
c) Cell wall
d) Cytoplasm

✓ Data Interpretation:
"The graph shows enzyme activity at different temperatures. At which temperature is the enzyme denatured?"
a) 20°C
b) 37°C
c) 45°C
d) 60°C

✓ Cause-Effect / "Why" Questions:
"Why does increasing substrate concentration eventually stop increasing the rate of reaction?"
a) The enzyme denatures
b) All active sites are occupied
c) The substrate runs out
d) The temperature decreases

✗ DO NOT CREATE (These are AO1, not AO2):
- "What is the function of chloroplasts?" (simple recall)
- "Name the process of cell division." (definition)
- "List three parts of a cell." (memorization)

✗ DO NOT CREATE (These are AO3, too complex):
- "Evaluate the effectiveness of..." (evaluation)
- "Discuss the advantages and disadvantages..." (essay-style)
- "Compare and contrast..." (requires extended response)

REQUIREMENTS:
- Application of knowledge to an unfamiliar example, OR
- Interpretation of data/graphs/scenarios, OR
- One-sentence cause/effect or "why" question (multiple choice format)
- Must be answerable in under 30 seconds
- Avoid AO3 evaluative or essay-style questions

⏱️ TIME CONSTRAINT:
Every question MUST be answerable in under 30 seconds by a ${levelDisplay} student.

This means:
✓ Question text: 1-2 sentences maximum
✓ No lengthy data tables or complex diagrams needed
✓ Students can identify the answer quickly with their knowledge
✓ Each option: 5-8 words maximum (concise and clear)
✓ No multi-step calculations or complex reasoning chains
✓ Straightforward scenarios that test knowledge application, not puzzle-solving

✗ If a question requires more than 30 seconds of careful thinking, it's TOO COMPLEX. Simplify it.

❗ DO NOT:
- Label which option is correct
- Mention which questions are AO1/AO2 in the quiz
- Add any explanations in the quiz

📎 REQUIREMENTS FOR ANSWERS:
CRITICAL - USE THIS PRE-GENERATED ANSWER SEQUENCE:
The answer key sequence has been pre-generated for you: "${answerSequence}"

YOU MUST:
1. Use this EXACT sequence - do NOT generate your own
2. For question 1, the correct answer is at position '${answerSequence?.[0]}' (a=0, b=1, c=2, d=3)
3. For question 2, the correct answer is at position '${answerSequence?.[1]}'
4. Continue this pattern for all 30 questions
5. This sequence already has no consecutive duplicates and equal distribution
6. Place the correct answer at the position indicated by each letter in the sequence
7. Do NOT show any planning steps
8. Do NOT list or label which answers are correct until the answer key at the very end

At the very end of the document, after all 30 questions, include an answer key only.

Respond with ONLY valid JSON in this exact format:
{
  "title": "Retrieval Quiz – [Current Date]",
  "answerKeySequence": "${answerSequence}",
  "questions": [
    {
      "text": "Question 1 text",
      "type": "MULTIPLE_CHOICE",
      "topic": "Topic A",
      "questionNumber": 1,
      "options": ["option a", "option b", "option c", "option d"],
      "correctAnswer": 0,
      "maxMarks": 1
    }
  ]
}

CRITICAL JSON REQUIREMENTS:
- The answerKeySequence must be generated FIRST and locked before writing questions
- Each question's correctAnswer index (0=a, 1=b, 2=c, 3=d) must match the corresponding letter in answerKeySequence
- Ensure no consecutive questions have the same correctAnswer index
- Ensure roughly equal distribution of a,b,c,d in the sequence (7-8 of each)
- Place the correct answer at the position indicated by the sequence letter
- Base all questions on the image content provided
- Plain text only, no markdown`;
          break; */

        /* COMMENTED OUT - Only Retrieval Quiz is active
        case "mini":
          const miniCounts = level === "A-LEVEL" ? "8 AO1, 10 AO2, 6 AO3" : "10 AO1, 6 AO2, 3 AO3";
          const totalQuestions = level === "A-LEVEL" ? 24 : 19;
          prompt = `You are generating a 10-15 minute ${levelDisplay} science worksheet (Mini Quiz) based on the image content.

CRITICAL INSTRUCTIONS:
Generate EXACTLY ${totalQuestions} questions total:
${level === "A-LEVEL" ? "- 8 AO1 questions (Remember/Understand)\n- 10 AO2 questions (Apply/Analyse)\n- 6 AO3 questions (Evaluate/Create)" : "- 10 AO1 questions (Remember/Understand)\n- 6 AO2 questions (Apply/Analyse)\n- 3 AO3 questions (Evaluate/Create)"}

Assessment Framework:
- Use Bloom's Taxonomy progression: AO1 → Remember, Understand | AO2 → Apply, Analyse | AO3 → Evaluate, Create
- ${level === "A-LEVEL" ? "OCR A-Level Biology" : "AQA GCSE Science"} standards
- Address all sub-points of assessment objectives

Coverage Requirements:
- Cover as much of the textbook extract as possible
- Touch on all key definitions, processes, functions, examples, and practical details
- Act as a broad coverage check, not narrow subset

Format Requirements:
- Plain text only (easy to copy to Word/Google Docs)
- Title: "[INSERT TOPIC] - Mini Quiz"
- Clear sub-headings and sections (emboldened where appropriate)
- Include a self-reflection question at the end with 3 options
- After self-reflection: "Include your answer to this in the comment section"
- Include student-friendly mark scheme with bullet points
- Mark scheme should have sections and question numbers

Respond with ONLY valid JSON. Use this EXACT format with NO extra commas or syntax errors:
{
  "questions": [
    {
      "text": "question text here",
      "type": "SHORT_ANSWER",
      "maxMarks": 2
    }
  ]
}

CRITICAL JSON RULES:
- NO trailing commas before closing braces or brackets
- Use double quotes for all strings
- Escape special characters properly
- For MULTIPLE_CHOICE: place correct answer at index 0 in options array
- For SHORT_ANSWER/LONG_ANSWER: omit options and correctAnswer fields
- Keep JSON simple and valid`;
          break;

        case "assignment":
          const aoDistribution = level === "A-LEVEL" 
            ? "2 marks AO1 (knowledge/understanding), 5 marks AO2 (application), 3 marks AO3 (analysis/evaluation)"
            : "3 marks AO1 (knowledge/understanding), 4 marks AO2 (application), 3 marks AO3 (analysis/evaluation)";
          
          const difficultyProgression = level === "A-LEVEL"
            ? "Question 1: Least challenging (bridging GCSE and A-level)\nQuestions 2-3: Standard A-level difficulty\nQuestion 4: Slightly more demanding (but within specification)"
            : "Question 1: Grade 4-5 level\nQuestions 2-3: Grade 6-7 level\nQuestion 4: Grade 8-9 level (but within specification)";

          prompt = `Create a 40-mark exam-style assignment for ${levelDisplay} ${level === "A-LEVEL" ? "OCR A-Level Biology" : "AQA GCSE Science"} based on the image content.

CRITICAL STRUCTURE:
- EXACTLY 4 questions, each worth 10 marks (40 marks total)
- Each question: ${aoDistribution}
- This should feel like a mini mock exam, not just practice questions

Difficulty Progression:
${difficultyProgression}

Question Requirements:
- Use ${level === "A-LEVEL" ? "OCR A-Level Biology" : "AQA GCSE Science"} style command words (state, describe, explain, suggest, compare, evaluate, calculate)
- Include variety of command words across questions
- Balance theory and practical/skills-based assessment
- Link practical/skills assessment to underlying ${level === "A-LEVEL" ? "biological" : "scientific"} theory
- Skills questions should assess conceptual understanding, not just method
- Include data/information in text form for interpretation
- Assess deep conceptual understanding
- AO3 questions should reward reasoned, conceptual evaluation (not surface-level recall)

Content Coverage:
- Use full content of textbook extract as base
- Cover as much textbook content as possible
- Only mild overlap with mini quiz questions (to support recall)

Format Requirements:
- Plain text only (easy to copy to Word)
- Title: "[INSERT TOPICS] (Assignment)"
- NO emboldened text
- NO answer lines
- Question number line should only have the question itself
- Clean question paper format

Respond with ONLY valid JSON in this exact format:
{
  "title": "[Topic Name] (Assignment)",
  "questions": [
    {
      "questionNumber": 1,
      "text": "Question text with command word",
      "type": "LONG_ANSWER",
      "maxMarks": 10,
      "aoBreakdown": "2 AO1, 5 AO2, 3 AO3",
      "markScheme": ["mark point 1", "mark point 2", "mark point 3"]
    }
  ]
}

IMPORTANT:
- NO trailing commas in JSON
- Each question must be 10 marks
- Include detailed mark scheme with indicative content
- ${level === "A-LEVEL" ? "Include level-of-response criteria for AO3 parts" : "Use bullet point style for mark scheme"}`;
          break;

        case "application":
          prompt = `Create a 12-question science worksheet for a student who struggles with application questions, based on the textbook content in the image.

CRITICAL STRUCTURE:
- EXACTLY 12 questions total
- 3-tier difficulty structure:
  * Tier 1: 3 questions (simple application with familiar material)
  * Tier 2: 5 questions (new contexts, analogy, statement/claim judgement)
  * Tier 3: 4 questions (multi-step or data-based)

Question Requirements:
- Questions based on textbook content BUT written in NOVEL contexts
- Student must transfer their knowledge to unfamiliar scenarios
- Each question should be ONE LINE only
- Followed by "Prior knowledge needed:" (leave blank for students to fill in)
- Use OCR exam command words: state, describe, explain, suggest, compare, evaluate, calculate
- Mix of question styles:
  * Scenario-based (real-life contexts)
  * Statement/claim-based
  * Analogy-based
  * Data/calculation questions
- Include applied or unfamiliar contexts:
  * Medical contexts
  * Technological contexts
  * Ecological contexts
  * Everyday analogies

Worked Example:
- Include ONE worked example at the start
- Should be a more complex application-style question
- For worked example: "Prior knowledge needed:" should only state the topic area (not full answer)

Format Requirements:
- Plain text only
- Tier subheadings: "Tier 1", "Tier 2", "Tier 3" (NO extra descriptions)
- Each question one line
- "Prior knowledge needed:" after each question (blank)

Respond with ONLY valid JSON in this exact format:
{
  "workedExample": {
    "text": "Complex application question",
    "priorKnowledge": "Topic area only",
    "solution": "Step by step solution"
  },
  "questions": [
    {
      "tier": 1,
      "text": "One-line question in novel context",
      "type": "SHORT_ANSWER",
      "maxMarks": 2
    }
  ]
}

IMPORTANT:
- NO trailing commas in JSON
- Questions must be in novel/unfamiliar contexts
- Transfer knowledge, don't just recall`;
          break;

        case "marks-per-point":
          prompt = `Create a set of 12 GCSE science practice questions based on the topics in the image.

CRITICAL REQUIREMENTS:
- EXACTLY 12 questions total
- Questions worth 2, 3, or 4 marks each
- NO calculation questions - ONLY explanation and description
- Exam-style format
- Students should answer in bullet points
- Clear mark scheme for each question at the end

Format Requirements:
- Title: "Marks Per Point: [INSERT TOPICS]"
- Plain text format (easy to copy to Google Docs)
- Each question clearly numbered
- Mark scheme at the end with bullet points

Respond with ONLY valid JSON in this exact format:
{
  "title": "Marks Per Point: [Topic Name]",
  "questions": [
    {
      "text": "Explain why... (exam-style question)",
      "type": "SHORT_ANSWER",
      "maxMarks": 2,
      "markScheme": ["mark point 1", "mark point 2"]
    }
  ]
}

IMPORTANT:
- NO trailing commas in JSON
- Only explanation/description questions
- Each question must have clear mark scheme`;
          break;

        case "specific":
          prompt = `Create 12 practice questions to help a student practice a specific exam technique based on the image content.

CONTEXT:
A student struggled with a question because they lacked a specific exam technique. This technique has been retaught, and now they need practice questions.

CRITICAL REQUIREMENTS:
- EXACTLY 12 questions total
- All questions focus on practicing the SAME exam technique
- Questions can cover variety of topics (not just the original question topic)
- Exam-style format
- Allow focused technique practice

Question Design:
- Questions should require the specific technique to answer well
- Variety of topics to show technique applies broadly
- Exam-style command words
- Range of mark values (2-6 marks)

Respond with ONLY valid JSON in this exact format:
{
  "technique": "Description of the exam technique being practiced",
  "questions": [
    {
      "text": "Question requiring the technique",
      "type": "SHORT_ANSWER",
      "maxMarks": 3
    }
  ]
}

IMPORTANT:
- NO trailing commas in JSON
- All questions must practice the same technique
- Variety of topics to reinforce technique`;
          break;
        */

        default:
          prompt = `Generate ${config.questionCount} ${config.questionType} questions for ${levelDisplay} based on the image.

CRITICAL: Respond with ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "text": "question text",
      "type": "MULTIPLE_CHOICE",
      "options": ["correct answer FIRST", "wrong1", "wrong2", "wrong3"],
      "correctAnswer": 0,
      "maxMarks": 1
    }
  ]
}

For MULTIPLE_CHOICE: place correct answer at index 0 in options array.
For SHORT_ANSWER/LONG_ANSWER: omit options and correctAnswer.`;
      }
    }

    console.log("📝 Final prompt:", prompt);

    // Pass the image to the vision model
    const questions = await generateStructuredQuestions(apiKey, prompt, imageBase64);

    console.log("✅ Successfully generated questions");
    console.log("=".repeat(60) + "\n");

    return NextResponse.json({ questions });
  } catch (error) {
    console.error("\n" + "❌".repeat(30));
    console.error('Error generating questions:', error);
    console.error("❌".repeat(30) + "\n");
    return NextResponse.json(
      { error: 'Failed to generate questions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}