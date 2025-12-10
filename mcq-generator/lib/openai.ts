import OpenAI from "openai";
import { GeneratedQuestion, TopicQuestions } from "./types";

// Function to shuffle array (Fisher-Yates algorithm)
function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Sanitize text to remove problematic characters and fix formatting
 */
function sanitizeText(text: string): string {
    // Remove or replace problematic Unicode characters
    let cleaned = text
        // Remove zero-width spaces and other invisible characters
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        // Replace smart quotes with regular quotes
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        // Remove control characters
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        // Replace multiple spaces with single space
        .replace(/\s+/g, ' ')
        // Remove strange spacing around operators
        .replace(/\s*([²³⁺⁻⁰¹⁴⁵⁶⁷⁸⁹])\s*/g, '$1')
        // Trim
        .trim();

    // Fix common chemical notation issues
    cleaned = cleaned
        // Fix superscript numbers that got corrupted
        .replace(/O\s*z/gi, 'O2-')
        .replace(/O\s*²\s*z/gi, 'O2-')
        .replace(/O\s*²\s*{/gi, 'O2-')
        .replace(/O\s*{/gi, 'O-')
        // Fix Cl ion notation
        .replace(/Cl\s*z/gi, 'Cl-')
        .replace(/Cl\s*{/gi, 'Cl-')
        // Fix Mg notation
        .replace(/Mg\s*²\s*\+/gi, 'Mg2+')
        .replace(/Mg\s*z/gi, 'Mg2+')
        // Fix Na notation
        .replace(/Na\s*\+/gi, 'Na+')
        // Fix generic corrupted superscripts
        .replace(/([A-Z][a-z]?)\s*[²³⁴⁵⁶⁷⁸⁹]\s*[z{]/gi, (match, element) => {
            // Try to preserve the number if visible
            const numMatch = match.match(/[²³⁴⁵⁶⁷⁸⁹]/);
            if (numMatch) {
                const superscriptMap: Record<string, string> = {
                    '²': '2', '³': '3', '⁴': '4', '⁵': '5',
                    '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9'
                };
                const num = superscriptMap[numMatch[0]] || '2';
                return `${element}${num}-`;
            }
            return `${element}-`;
        })
        // Fix MgO2 or similar
        .replace(/MgO\s*‚/gi, 'MgO2')
        .replace(/([A-Z][a-z]?[A-Z])\s*‚/g, '$12')
        // Fix generic weird spacing before punctuation
        .replace(/\s+([.,;:?!)])/g, '$1')
        .replace(/([(\[])\s+/g, '$1');

    return cleaned;
}

/**
 * Sanitize an entire question object
 */
function sanitizeQuestion(question: GeneratedQuestion): GeneratedQuestion {
    return {
        ...question,
        text: sanitizeText(question.text),
        options: question.options?.map(opt => sanitizeText(opt)),
        topic: question.topic ? sanitizeText(question.topic) : question.topic
    };
}

/**
 * VALIDATION: Check if AO2 questions meet quality standards
 */
function validateAO2Quality(questions: GeneratedQuestion[]): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const ao2Questions = questions.slice(5, 10); // Questions 6-10

    ao2Questions.forEach((q, index) => {
        const qNum = index + 6;
        const text = q.text.toLowerCase();

        // Check for weak AO2 indicators
        const weakIndicators = [
            'what is',
            'define',
            'which term',
            'name the',
            'list',
            'state the function of',
            'what does',
            'where is'
        ];

        const hasWeakIndicator = weakIndicators.some(indicator => text.startsWith(indicator));

        if (hasWeakIndicator) {
            issues.push(`Q${qNum} appears to be AO1 (recall) not AO2 (application)`);
        }

        // Check for strong AO2 indicators
        const strongIndicators = [
            'why',
            'how',
            'explain',
            'what happens',
            'calculate',
            'reading',
            'measurement',
            'experiment',
            'student',
            'result',
            'uncertainty',
            'range',
            'mean',
            'data',
            'temperature',
            'rate',
            'increase',
            'decrease',
            'reaction',
            'process',
            'observ', // catches "observes", "observation"
            'during',
            'when',
            'form', // catches "formed", "formation"
        ];

        const hasStrongIndicator = strongIndicators.some(indicator => text.includes(indicator));

        if (!hasStrongIndicator && !text.includes('?')) {
            issues.push(`Q${qNum} lacks application context (no scenario/data/reasoning)`);
        }

        // Check question length (AO2 should be longer with context)
        if (q.text.length < 40) {
            issues.push(`Q${qNum} too short for AO2 (needs context/scenario)`);
        }
    });

    return {
        valid: issues.length === 0,
        issues
    };
}

/**
 * Check for formatting/encoding issues in questions
 */
function validateFormatting(questions: GeneratedQuestion[]): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    questions.forEach((q, index) => {
        const qNum = index + 1;

        // Check for problematic characters in question text
        const problematicChars = /[‚„†‡ˆ‰Š‹ŒŽ''""•–—˜™š›œžŸ]/;
        if (problematicChars.test(q.text)) {
            issues.push(`Q${qNum} contains formatting issues in text`);
        }

        // Check options for problematic characters
        if (q.options) {
            q.options.forEach((opt, optIndex) => {
                if (problematicChars.test(opt)) {
                    issues.push(`Q${qNum} option ${String.fromCharCode(97 + optIndex)} has formatting issues`);
                }
            });
        }

        // Check for excessive spacing
        if (/\s{2,}/.test(q.text) || q.options?.some(opt => /\s{2,}/.test(opt))) {
            issues.push(`Q${qNum} has excessive spacing`);
        }
    });

    return {
        valid: issues.length === 0,
        issues
    };
}

// Randomize MCQ answer positions
function randomizeAnswers(questions: GeneratedQuestion[]): GeneratedQuestion[] {
    return questions.map(q => {
        if (q.type === "MULTIPLE_CHOICE" && q.options && q.correctAnswer !== undefined) {
            const correctOption = q.options[q.correctAnswer];
            const shuffled = shuffleArray(q.options);
            const newCorrectIndex = shuffled.indexOf(correctOption);

            return {
                ...q,
                options: shuffled,
                correctAnswer: newCorrectIndex
            };
        }
        return q;
    });
}

export async function generateStructuredQuestions(
    apiKey: string,
    prompt: string,
    imageBase64?: string | string[],
): Promise<GeneratedQuestion[]> {
    console.log("🚀 [STAGE 1] Starting question generation...");

    const images = Array.isArray(imageBase64) ? imageBase64 : (imageBase64 ? [imageBase64] : []);
    console.log("🖼️  Images provided:", images.length > 0 ? `Yes (${images.length} image(s))` : "No");

    const client = new OpenAI({
        apiKey,
        baseURL: "https://api.openai.com/v1",
    });

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [
        { type: "text", text: prompt }
    ];

    if (images.length > 0) {
        images.forEach((img, index) => {
            userContent.push({
                type: "image_url",
                image_url: {
                    url: img,
                    detail: "high"
                }
            });
            console.log(`✅ Image ${index + 1} added to request`);
        });
    }

    console.log("🤖 [STAGE 2] Sending request to OpenAI...");

    const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: "You are a professional academic question generator for GCSE and A-Level education. Analyze images of study materials and generate high-quality questions following the exact specifications provided. Always respond with valid JSON only."
            },
            {
                role: "user",
                content: userContent as any,
            },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 4096,
    });

    console.log("✅ [STAGE 3] Received response from OpenAI");

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content returned from OpenAI response.");

    let jsonContent = content.trim();
    jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    let structured: { questions: GeneratedQuestion[] } | null = null;

    if (jsonContent.includes('"questions"')) {
        const jsonMatch = jsonContent.match(/\{[\s\S]*"questions"[\s\S]*\}/);
        if (jsonMatch) {
            jsonContent = jsonMatch[0];
            console.log("🔍 Found questions array structure");

            try {
                structured = JSON.parse(jsonContent) as { questions: GeneratedQuestion[] };
            } catch (parseError) {
                console.error("❌ JSON parse error:", parseError);
                let fixedJson = jsonContent
                    .replace(/,(\s*[}\]])/g, '$1')
                    .replace(/\n/g, ' ')
                    .replace(/\r/g, '')
                    .replace(/\t/g, ' ')
                    .replace(/\\/g, '\\\\')
                    .replace(/[\u0000-\u001F]+/g, '');

                structured = JSON.parse(fixedJson) as { questions: GeneratedQuestion[] };
            }
        }
    }

    if (!structured) {
        console.log("🔧 Model returned individual questions, extracting...");
        const questionMatches = jsonContent.match(/\{[^{}]*"type"[^{}]*(?:\[[^\]]*\])?[^{}]*\}/g);

        if (questionMatches && questionMatches.length > 0) {
            const questions = questionMatches.map((q, index) => {
                try {
                    const parsed = JSON.parse(q);
                    return {
                        text: parsed.question || parsed.text || "",
                        type: parsed.type,
                        options: parsed.options || [],
                        correctAnswer: typeof parsed.correctAnswer === 'string' ? 0 : (parsed.correctAnswer || 0),
                        maxMarks: parseInt(parsed.maxMarks) || 1
                    };
                } catch (e) {
                    console.error(`Failed to parse question ${index + 1}:`, q, e);
                    return null;
                }
            }).filter(q => q !== null);

            structured = { questions: questions as GeneratedQuestion[] };
        } else {
            throw new Error("Could not find valid question objects in response");
        }
    }

    console.log(`✅ Parsed ${structured.questions.length} questions`);

    // Randomize MCQ answer positions
    console.log("🎲 [STAGE 6] Randomizing answer positions...");
    const randomized = randomizeAnswers(structured.questions);

    console.log("🎉 [STAGE 7] Question generation complete!");

    return randomized;
}

/**
 * Process a single image to generate topic-based questions with STRONG AO2 validation
 */
export async function generateTopicQuestions(
    apiKey: string,
    imageBase64: string,
    topicLabel: string,
    answerSequence: string,
    educationLevel: "GCSE" | "A-LEVEL"
): Promise<TopicQuestions> {
    console.log(`🚀 [${topicLabel}] Starting question generation...`);

    const client = new OpenAI({
        apiKey,
        baseURL: "https://api.openai.com/v1",
    });

    const levelDisplay = educationLevel === "GCSE" ? "GCSE" : "A-Level";

    const prompt = `You are generating exam-standard multiple-choice questions for ONE topic of a ${levelDisplay} retrieval quiz.

=====================
CRITICAL INSTRUCTIONS
=====================

1) Analyze the uploaded image and infer the topic.
   - Produce a short, descriptive topic title (e.g., "Uncertainties and Evaluations", "Reactions of Acids").
   - Do NOT add numbering, labels, or prefixes such as "Topic A".

2) Generate EXACTLY 10 MCQs:
   - Questions 1–5 = AO1 (pure recall)
   - Questions 6–10 = AO2 (application ONLY)

3) Use THIS answer sequence STRICTLY: "${answerSequence}"
   - Q1 correct answer = index of '${answerSequence[0]}' (a=0, b=1, c=2, d=3)
   - Continue the same for all 10 questions.



=========================================
AO1 QUESTIONS (Q1–Q5) - PURE RECALL
=========================================

These MUST be straightforward recall questions:
✓ "What is [definition]?"
✓ "Which term means [concept]?"
✓ "Define [term]"
✓ "What does [term] mean?"
✓ "Which organelle/process/element [simple fact]?"

Examples:
• "What is the function of mitochondria?"
• "Which scientist discovered electrons?"
• "Define the term 'catalyst'."

❌ DO NOT include reasoning, scenarios, or calculations in AO1.

=========================================
AO2 QUESTIONS (Q6–Q10) - APPLICATION ONLY
=========================================

FOR AO2 QUESTIONS (Q6–Q10) — STRICT REQUIREMENTS

Every AO2 question MUST:
1. Be based on an applied scenario (mandatory)
2. Include either:
   - numerical data,
   - an experiment setup,
   - observations,
   - measurements,
   - or a real-world context.
3. Follow one of the templates:
   T1: Numerical calculation
   T2: Experimental observation
   T3: Real-world applied situation
   T4: Data/graph/table interpretation
4. Begin with one of these mandatory AO2 openers:
   "A student measures..."
   "A student observes..."
   "In an experiment..."
   "A force of..."
   "A sample shows..."
   "A reading of..."
   "During a reaction..."
5. Use only application verbs:
   calculate, determine, predict, interpret, use the data
6. Do NOT ask conceptual-only questions.
7. If an AO2 question lacks data OR an experiment, it is INVALID and must be regenerated.

=========================================
EXACT AO2 EXAMPLES TO FOLLOW
=========================================

**Topic: Uncertainties and Evaluations**

✅ GOOD AO2 (USE THESE AS TEMPLATES):

"A student measures three readings: 19.8 cm3, 20.1 cm3, and 20.0 cm3. What is the range?"
a) 0.3 cm3
b) 0.2 cm3
c) 0.4 cm3
d) 0.1 cm3

"If a titration has a mean of 19.97 cm3 and an uncertainty of ±0.15 cm3, which result best expresses the mean?"
a) 19.97 cm3 ± 0.15 cm3
b) 19.97 ± 0.30 cm3
c) 20.00 ± 0.15 cm3
d) 19.97 ± 0.10 cm3

"A larger number of measurements is taken in an experiment. How does this affect uncertainty?"
a) Increases uncertainty
b) Has no effect
c) Reduces uncertainty in the mean
d) Makes results less accurate

"Why should you comment on the validity of the method in an evaluation?"
a) To decide if the results were random
b) To check if the investigation was fair
c) To calculate the uncertainty
d) To identify the range of data

"In an enzyme experiment, why would taking more readings around the optimum temperature improve results?"
a) It increases errors
b) It helps find a more accurate optimum value
c) It changes the enzyme's structure
d) It removes all uncertainty

**Topic: Reactions of Acids**

✅ GOOD AO2:

"When copper oxide reacts with hydrochloric acid, what salt is formed?"
a) Copper sulfate
b) Copper nitrate
c) Copper chloride
d) Copper carbonate

"A student reacts sulfuric acid with sodium carbonate. What products form?"
a) Sodium sulfate, water, and carbon dioxide
b) Sodium chloride and water
c) Sodium nitrate and hydrogen
d) Sodium hydroxide and carbon dioxide

"Why is the acid warmed gently before adding an insoluble base?"
a) To speed up the reaction
b) To evaporate the acid
c) To cool the mixture
d) To prevent salt formation

"After filtering a salt solution, why is it heated in a water bath rather than directly on a flame?"
a) To prevent decomposition of the salt
b) To make it boil faster
c) To remove impurities
d) To mix the acid and base better

"In the reaction between nitric acid and potassium hydroxide, what products are formed?"
a) Potassium nitrate and water
b) Potassium sulfate and carbon dioxide
c) Potassium oxide and hydrogen
d) Potassium chloride and oxygen

**Topic: Ionic Bonding**

✅ GOOD AO2 (NOTE THE PLAIN TEXT NOTATION):

"A student observes sodium and chlorine reacting. What happens to sodium's electrons?"
a) Gains one
b) Gains two
c) Loses one
d) Loses two

"In an experiment, magnesium reacts with oxygen. What is formed?"
a) MgO
b) MgCl2
c) MgO2
d) MgC

"Why are ionic compounds usually solid at room temperature?"
a) Weak forces
b) High energy
c) Strong electrostatic forces
d) Low melting point

"A student draws a dot and cross diagram for NaCl. What should the Cl atom show?"
a) One electron gained
b) Two electrons gained
c) Eight electrons total
d) Seven electrons originally

"During the formation of MgCl2, how many electrons does each chlorine atom gain?"
a) Two electrons
b) Three electrons
c) One electron
d) No electrons


=========================================
❌ WEAK AO2 EXAMPLES (DO NOT CREATE)
=========================================

❌ "Why do electrons orbit the nucleus?" (conceptual, not applied)
❌ "What is respiration?" (this is AO1 recall)
❌ "Define metabolism" (this is AO1 recall)
❌ "Which organelle produces energy?" (simple recall)
❌ "What does enzyme mean?" (definition, not application)

=========================================
FORMAT REQUIREMENTS
=========================================

- Each question = 1-2 sentences maximum
- All answer options = concise (5-10 words)
- Distractors = plausible misconceptions
- Questions must relate to the image content
- No markdown, no explanations
- PLAIN TEXT ONLY - no special characters

=====================
OUTPUT FORMAT (STRICT)
=====================

Return ONLY valid JSON:

{
  "topicTitle": "Example Title",
  "questions": [
    {
      "text": "Question text here",
      "options": ["option a", "option b", "option c", "option d"],
      "correctAnswer": 0
    }
  ]
}

REMEMBER: Use PLAIN TEXT for all chemical formulas! "O2-" not "O²⁻", "MgO2" not "MgO₂"!`;

    const userContent = [
        { type: "text" as const, text: prompt },
        {
            type: "image_url" as const,
            image_url: {
                url: imageBase64,
                detail: "high" as const
            }
        }
    ];

    console.log(`🤖 [${topicLabel}] Sending request to OpenAI...`);

    // Retry mechanism for AO2 quality AND formatting
    let attempts = 0;
    const maxAttempts = 3; // Increased to 3 for formatting retries
    let result: TopicQuestions | null = null;

    while (attempts < maxAttempts && !result) {
        attempts++;
        console.log(`📝 [${topicLabel}] Attempt ${attempts}/${maxAttempts}`);

        const response = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "You are a professional academic question generator for GCSE and A-Level education. Your specialty is creating HIGH-QUALITY AO2 questions that require real reasoning, application, and interpretation - NOT simple recall. AO2 questions MUST include scenarios, data, experiments, or cause-effect reasoning. CRITICAL: Use PLAIN TEXT ONLY - no superscripts, subscripts, or special Unicode characters. Write 'O2-' not 'O²⁻', 'MgO2' not 'MgO₂'. Follow the provided examples exactly. Always respond with VALID JSON only."
                },
                {
                    role: "user",
                    content: userContent,
                },
            ],
            response_format: { type: "json_object" },
            temperature: 0.5,
            max_tokens: 2048,
        });

        console.log(`✅ [${topicLabel}] Received response from OpenAI (Attempt ${attempts})`);

        const content = response.choices[0].message.content;
        if (!content) throw new Error(`No content returned for ${topicLabel}`);

        let jsonContent = content.trim();
        jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        const parsed = JSON.parse(jsonContent) as {
            topicTitle: string;
            questions: Array<{
                text: string;
                options: string[];
                correctAnswer: number;
            }>;
        };

        if (parsed.questions.length !== 10) {
            console.warn(`⚠️ [${topicLabel}] Expected 10 questions, got ${parsed.questions.length}`);
        }

        // Transform to our format
        let questions: GeneratedQuestion[] = parsed.questions.map((q, index) => ({
            text: q.text,
            type: "MULTIPLE_CHOICE" as const,
            options: q.options,
            correctAnswer: q.correctAnswer,
            maxMarks: 1,
            topic: `${topicLabel}: ${parsed.topicTitle}`,
            questionNumber: index + 1
        }));

        // SANITIZE all questions
        console.log(`🧹 [${topicLabel}] Sanitizing text formatting...`);
        questions = questions.map(sanitizeQuestion);

        // VALIDATION 1: Check AO2 quality
        const ao2Validation = validateAO2Quality(questions);

        // VALIDATION 2: Check formatting
        const formatValidation = validateFormatting(questions);

        const allValid = ao2Validation.valid && formatValidation.valid;

        if (allValid) {
            console.log(`✅ [${topicLabel}] AO2 validation PASSED`);
            console.log(`✅ [${topicLabel}] Formatting validation PASSED`);
            result = {
                topicTitle: `${topicLabel}: ${parsed.topicTitle}`,
                topicLabel,
                questions,
                answerSequence
            };
        } else {
            if (!ao2Validation.valid) {
                console.warn(`⚠️ [${topicLabel}] AO2 validation FAILED on attempt ${attempts}:`);
                ao2Validation.issues.forEach(issue => console.warn(`   - ${issue}`));
            }

            if (!formatValidation.valid) {
                console.warn(`⚠️ [${topicLabel}] Formatting validation FAILED on attempt ${attempts}:`);
                formatValidation.issues.forEach(issue => console.warn(`   - ${issue}`));
            }

            if (attempts < maxAttempts) {
                console.log(`🔄 [${topicLabel}] Retrying with stricter instructions...`);
            } else {
                console.warn(`⚠️ [${topicLabel}] Max attempts reached. Using sanitized questions despite validation issues.`);
                result = {
                    topicTitle: `${topicLabel}: ${parsed.topicTitle}`,
                    topicLabel,
                    questions, // Already sanitized
                    answerSequence
                };
            }
        }
    }

    if (!result) {
        throw new Error(`Failed to generate quality questions for ${topicLabel}`);
    }

    console.log(`🎉 [${topicLabel}] Generated ${result.questions.length} questions for "${result.topicTitle}"`);

    return result;
}

/**
 * Process 3 images concurrently to generate a complete retrieval quiz
 */
export async function generateRetrievalQuizConcurrent(
    apiKey: string,
    images: [string, string, string],
    answerSequences: [string, string, string],
    educationLevel: "GCSE" | "A-LEVEL"
): Promise<TopicQuestions[]> {
    console.log("🚀 Starting concurrent processing of 3 images...");

    const topicLabels = ["Topic A", "Topic B", "Topic C"] as const;

    // Process all 3 images concurrently
    const promises = images.map((image, index) =>
        generateTopicQuestions(
            apiKey,
            image,
            topicLabels[index],
            answerSequences[index],
            educationLevel
        )
    );

    const results = await Promise.all(promises);

    console.log("✅ All 3 topics processed successfully!");
    console.log(`📊 Total questions: ${results.reduce((sum, r) => sum + r.questions.length, 0)}`);

    return results;
}