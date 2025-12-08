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
    console.log("📝 Prompt:", prompt);

    // Handle both single image and array of images
    const images = Array.isArray(imageBase64) ? imageBase64 : (imageBase64 ? [imageBase64] : []);
    console.log("🖼️  Images provided:", images.length > 0 ? `Yes (${images.length} image(s))` : "No");

    const client = new OpenAI({
        apiKey, // Uses OpenAI API directly
        baseURL: "https://api.openai.com/v1", // Official OpenAI endpoint
    });

    // Build message content with image(s) if provided
    const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [
        { type: "text", text: prompt }
    ];

    // Add all images to the content
    if (images.length > 0) {
        images.forEach((img, index) => {
            userContent.push({
                type: "image_url",
                image_url: {
                    url: img,
                    detail: "high" // High detail for better OCR and text recognition
                }
            });
            console.log(`✅ Image ${index + 1} added to request`);
        });
    }

    console.log("🤖 [STAGE 2] Sending request to OpenAI...");
    console.log("📡 Model: gpt-4o (GPT-4 Omni with vision capabilities)");

    const response = await client.chat.completions.create({
        model: "gpt-4o", // GPT-4 Omni - OpenAI's latest multimodal model with vision
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
        response_format: { type: "json_object" }, // Ensures valid JSON response from OpenAI
        temperature: 0.7,
        max_tokens: 4096, // Sufficient for generating multiple questions
    });

    console.log("✅ [STAGE 3] Received response from OpenAI");

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content returned from OpenAI response.");

    console.log("📄 [STAGE 4] Raw response content:");
    console.log(content);

    // Try to extract JSON from the response (in case model adds extra text)
    let jsonContent = content.trim();

    // Remove markdown code blocks if present
    jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    // Try to find a proper questions array structure
    let structured: { questions: GeneratedQuestion[] } | null = null;

    // Check if response already has the correct structure
    if (jsonContent.includes('"questions"')) {
        const jsonMatch = jsonContent.match(/\{[\s\S]*"questions"[\s\S]*\}/);
        if (jsonMatch) {
            jsonContent = jsonMatch[0];
            console.log("🔍 Found questions array structure");
            console.log("🔧 [STAGE 5] Parsing JSON...");

            try {
                structured = JSON.parse(jsonContent) as { questions: GeneratedQuestion[] };
            } catch (parseError) {
                console.error("❌ JSON parse error:", parseError);
                console.error("📄 Problematic JSON (first 1000 chars):");
                console.error(jsonContent.substring(0, 1000));

                // Try to fix common JSON issues
                let fixedJson = jsonContent
                    .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
                    .replace(/\n/g, ' ') // Remove newlines
                    .replace(/\r/g, '') // Remove carriage returns
                    .replace(/\t/g, ' ') // Replace tabs with spaces
                    .replace(/\\/g, '\\\\') // Escape backslashes
                    .replace(/[\u0000-\u001F]+/g, ''); // Remove control characters

                console.log("🔧 Attempting to parse fixed JSON...");
                structured = JSON.parse(fixedJson) as { questions: GeneratedQuestion[] };
            }
        }
    }

    // If not found, try to extract individual question objects
    if (!structured) {
        console.log("🔧 Model returned individual questions, extracting...");

        // More flexible regex to match JSON objects with nested arrays
        const questionMatches = jsonContent.match(/\{[^{}]*"type"[^{}]*(?:\[[^\]]*\])?[^{}]*\}/g);

        console.log("Regex matches found:", questionMatches?.length || 0);
        if (questionMatches) {
            console.log("First match sample:", questionMatches[0]);
        }

        if (questionMatches && questionMatches.length > 0) {
            console.log(`Found ${questionMatches.length} individual question objects`);

            // Parse each question and fix the structure
            const questions = questionMatches.map((q, index) => {
                try {
                    const parsed = JSON.parse(q);
                    console.log(`Parsing question ${index + 1}:`, parsed);

                    // Normalize the structure
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
            console.log(`✅ Extracted and normalized ${questions.length} questions`);
        } else {
            console.error("❌ No question objects found. Raw content:");
            console.error(jsonContent.substring(0, 500));
            throw new Error("Could not find valid question objects in response");
        }
    }

    console.log(`✅ Parsed ${structured.questions.length} questions`);

    // Randomize MCQ answer positions to avoid LLM bias
    console.log("🎲 [STAGE 6] Randomizing answer positions...");
    const randomized = randomizeAnswers(structured.questions);

    console.log("🎉 [STAGE 7] Question generation complete!");
    console.log("📊 Final questions:", JSON.stringify(randomized, null, 2));

    return randomized;
}

/**
 *
 Process a single image to generate topic-based questions with structured output
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

    const prompt = `You are generating questions for ONE topic of a ${levelDisplay} retrieval quiz.

=====================
CRITICAL INSTRUCTIONS
=====================

1) Analyze the image and infer the topic.  
   - Produce a short, descriptive topic title (e.g., "Cell Biology", "Uncertainties & Evaluations").  
   - Do NOT add prefixes like “Topic A”.

2) Generate EXACTLY 10 MCQs:
   - Questions 1–5 → AO1 (recall)
   - Questions 6–10 → AO2 (application)

3) Use this answer sequence (STRICTLY): "${answerSequence}"  
   - Answer for Q1 = index of '${answerSequence[0]}' (a=0, b=1, c=2, d=3)  
   - Continue same pattern for all 10 questions.

===========================
AO1 vs AO2 REQUIREMENTS
===========================

AO1 (Q1–Q5):  
- Pure recall: definitions, terms, basic facts, symbols.  
- Prompts should start with “What is…”, “Which term…”, “Define…”.  
- NO scenarios, NO data interpretation, NO calculations.

AO2 (Q6–Q10):  
- Application requiring reasoning, data interpretation, or evaluation.  
- Use short scenarios, simple numbers, or experiment contexts.  
- Examples of AO2 styles:
  • “A student records these values… calculate the range.”  
  • “Given this trend in the data, what does it suggest?”  
  • “An enzyme’s activity peaks at 37°C. What happens at 60°C?”  
- Must be clearly more complex than AO1.  
- NO pure recall.

========================
QUESTION FORMAT RULES
========================
- Each question: 1–2 sentences max.  
- Options: short, clear, 5–8 words each.  
- Distractors must be plausible and reflect real misconceptions.  
- Avoid ambiguous or opinion-based questions.  
- All 10 questions must relate to the inferred topic.

=====================
OUTPUT FORMAT (STRICT)
=====================
Return ONLY valid JSON in this EXACT shape:

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
}`;

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

    const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: "You are a professional academic question generator for GCSE and A-Level education. Analyze the image and generate high-quality questions following the exact specifications. Always respond with valid JSON only."
            },
            {
                role: "user",
                content: userContent as any,
            },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2048,
    });

    console.log(`✅ [${topicLabel}] Received response from OpenAI`);

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

    // Validate we got exactly 10 questions
    if (parsed.questions.length !== 10) {
        console.warn(`⚠️ [${topicLabel}] Expected 10 questions, got ${parsed.questions.length}`);
    }

    // Transform to our format
    const questions: GeneratedQuestion[] = parsed.questions.map((q, index) => ({
        text: q.text,
        type: "MULTIPLE_CHOICE" as const,
        options: q.options,
        correctAnswer: q.correctAnswer,
        maxMarks: 1,
        topic: `${topicLabel}: ${parsed.topicTitle}`,
        questionNumber: index + 1
    }));

    console.log(`🎉 [${topicLabel}] Generated ${questions.length} questions for "${parsed.topicTitle}"`);

    return {
        topicTitle: `${topicLabel}: ${parsed.topicTitle}`,
        topicLabel,
        questions,
        answerSequence
    };
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
