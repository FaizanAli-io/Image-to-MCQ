import OpenAI from "openai";
import { GeneratedQuestion } from "./types";

// Legacy function - kept for non-retrieval quiz types
export async function generateStructuredQuestions(
    apiKey: string,
    prompt: string,
    imageBase64?: string | string[],
): Promise<GeneratedQuestion[]> {
    const images = Array.isArray(imageBase64) ? imageBase64 : (imageBase64 ? [imageBase64] : []);

    const client = new OpenAI({
        apiKey,
        baseURL: "https://api.openai.com/v1",
    });

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [
        { type: "text", text: prompt }
    ];

    if (images.length > 0) {
        images.forEach((img) => {
            userContent.push({
                type: "image_url",
                image_url: {
                    url: img,
                    detail: "high"
                }
            });
        });
    }

    const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: userContent as any,
            },
        ],
        response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content returned from OpenAI response.");

    const jsonContent = content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const structured = JSON.parse(jsonContent) as { questions: GeneratedQuestion[] };

    return structured.questions;
}

// ============================================================================
// TEXT EXTRACTION API CALL - Extract and analyze text from images
// ============================================================================

/**
 * Extract all text from an image and provide analysis metrics
 */
// export async function extractTextFromImage(
//     apiKey: string,
//     image: string
// ): Promise<{
//     extractedText: string;
//     extractionPercentage: number;
//     unclearAreas: string[];
//     confidence: string;
//     totalWords: number;
//     readabilityScore: string;
// }> {
//     const client = new OpenAI({
//         apiKey,
//         baseURL: "https://api.openai.com/v1",
//     });

//     const prompt = `You are a text extraction specialist. Your task is to extract ALL visible text from this image and provide detailed analysis metrics.

// 🔹 EXTRACTION REQUIREMENTS:
// ● Extract EVERY piece of text visible in the image, including:
//   - Main body text
//   - Headers and titles
//   - Captions and labels
//   - Small print and footnotes
//   - Watermarks or stamps
//   - Any handwritten text
//   - Numbers, dates, and formulas
//   - Table contents and data

// 🔹 ANALYSIS REQUIREMENTS:
// ● Provide an honest assessment of extraction completeness (0-100%)
// ● Identify specific areas that are unclear, blurry, or unreadable
// ● Rate your confidence in the extraction accuracy
// ● Count total words extracted
// ● Assess overall text readability/quality

// 🔹 OUTPUT FORMAT:
// Respond with ONLY valid JSON in this exact format:
// {
//   "extractedText": "All the text you can read from the image, preserving structure and formatting as much as possible",
//   "extractionPercentage": 85,
//   "unclearAreas": ["bottom right corner text is blurry", "handwritten notes partially obscured"],
//   "confidence": "high|medium|low",
//   "totalWords": 247,
//   "readabilityScore": "excellent|good|fair|poor"
// }

// 🔹 IMPORTANT NOTES:
// ● Be thorough - don't miss any text
// ● Be honest about limitations and unclear areas
// ● Preserve text structure (paragraphs, lists, etc.) in the extractedText field
// ● If text is partially readable, include what you can make out and note the unclear parts
// ● Extraction percentage should reflect how much of ALL visible text you successfully extracted`;

//     const userContent = [
//         { type: "text" as const, text: prompt },
//         {
//             type: "image_url" as const,
//             image_url: {
//                 url: image,
//                 detail: "low" as const
//             }
//         }
//     ];

//     console.log("🔍 Starting text extraction from image...");

//     const response = await client.chat.completions.create({
//         model: "gpt-4o",
//         messages: [
//             {
//                 role: "user",
//                 content: userContent,
//             },
//         ],
//         response_format: { type: "json_object" },
//     });

//     const content = response.choices[0].message.content;
//     if (!content) throw new Error("No content returned from text extraction.");

//     const jsonContent = content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
//     const extractionResult = JSON.parse(jsonContent);

//     console.log("✅ Text extraction completed successfully");

//     return extractionResult;
// }

// ============================================================================
// MINI QUIZ WORKFLOW - Single image, single API call
// ============================================================================

/**
 * Generate a Mini Quiz from a single image
 */
export async function generateMiniQuiz(
    apiKey: string,
    imageUrl: string,
    educationLevel: "GCSE" | "A-LEVEL"
): Promise<GeneratedQuestion[]> {
    const client = new OpenAI({
        apiKey,
        baseURL: "https://api.openai.com/v1",
    });

    const levelDisplay = educationLevel === "GCSE" ? "GCSE" : "A-Level";

    // Set question counts based on education level
    let totalQuestions: number;
    let ao1Count: number;
    let ao2Count: number;
    let ao3Count: number;
    let ao1Range: string;
    let ao2Range: string;
    let ao3Range: string;

    if (educationLevel === "GCSE") {
        totalQuestions = 19;
        ao1Count = 10;
        ao2Count = 6;
        ao3Count = 3;
        ao1Range = "Questions 1–10";
        ao2Range = "Questions 11–16";
        ao3Range = "Questions 17-19";
    } else { // A-LEVEL
        totalQuestions = 24;
        ao1Count = 8;
        ao2Count = 10;
        ao3Count = 6;
        ao1Range = "Questions 1–8";
        ao2Range = "Questions 9–18";
        ao3Range = "Questions 19-24";
    }
    const prompt = `You are generating a ready-to-use ${levelDisplay} mini quiz for a single topic. Treat this as a final deliverable that students can use immediately.\n\n🔹 Format Requirements\n● Generate EXACTLY ${totalQuestions} questions for ONE topic inferred from the revision-guide image\n● Topic name must be derived from the image content\n● Plain text only (no markdown, tables, or images)\n● Base ALL questions strictly on the submitted revision-guide image\n\n🔹 Question Structure\n● The quiz must include:\n ○ ${ao1Count} AO1 questions (knowledge & understanding / recall)\n ○ ${ao2Count} AO2 questions (application, analysis, linked reasoning)\n ○ ${ao3Count} AO3 questions (evaluation, judgement, creation)\n\nAO1 – Knowledge & Understanding (${ao1Range})\n● Test direct recall and basic understanding from the image\n● Question types: define, state, name, identify, describe\n● Short, factual questions with clear right/wrong answers\n● No explanations or opinions\n\nAO2 – Apply & Analyse (${ao2Range})\n● Test application of knowledge and linked reasoning\n● Question types: explain why, describe how, compare, using your knowledge\n● Require 2–4 sentences of logical explanation\n● Must involve cause–effect, structure–function links, or application to a new situation\n● Must NOT be simple recall disguised as AO2\n\nAO3 – Evaluate & Create (${ao3Range})\n● Test higher-order thinking\n● Question types: evaluate, assess, predict and explain, suggest and justify\n● Open-ended questions with multiple valid answers\n● Marked on quality of reasoning, not a single correct point\n\n Strict Rules\n● Use ONLY the content shown in the image\n● Do NOT introduce external facts\n● Keep language clear and ${levelDisplay}-appropriate\n● Avoid essay-style questions\n● Ensure AO1, AO2, and AO3 are clearly distinct\n\n🔹 Mark Scheme Requirement\nAfter the quiz, provide a student-friendly mark scheme:\n● Bullet points per question\n● Clear expected answers for AO1\n● Indicative points for AO2 explanations\n● Level-based guidance for AO3 (what a good answer includes)\n● For AO2 and AO3 answers, include a short italic explanation (2 sentences are essential could be more) after each answer that explains the reasoning very simply for students who got it wrong\n\n🔹 JSON Output Format\nRespond with ONLY valid JSON in this exact format:\n{\n  \"topicName\": \"Topic Name from Image\",\n  \"questions\": [\n    {\n      \"text\": \"Question text here\",\n      \"type\": \"SHORT_ANSWER\",\n      \"maxMarks\": 2,\n      \"aoLevel\": \"AO1\"\n    }\n  ],\n  \"markScheme\": {\n    \"ao1\": [\n      {\n        \"questionNumber\": 1,\n        \"markPoints\": [\"Point 1\", \"Point 2\"]\n      }\n    ],\n    \"ao2\": [\n      {\n        \"questionNumber\": ${ao1Count + 1},\n        \"markPoints\": [\"Point 1\", \"Point 2\", \"*Simple explanation (up to 2 sentences) of why this answer is correct*\"]\n      }\n    ],\n    \"ao3\": [\n      {\n        \"questionNumber\": ${ao1Count + ao2Count + 1},\n        \"markPoints\": [\"Point 1\", \"Point 2\", \"*Simple explanation (up to 2 sentences) of what a good answer shows*\"]\n      }\n    ]\n  }\n}\n\nOutput ONLY:\n● The mini quiz\n● The mark scheme\nNo extra explanations or commentary.`;
    const userContent = [
        { type: "text" as const, text: prompt },
        {
            type: "image_url" as const,
            image_url: {
                url: imageUrl,
                detail: "high" as const
            }
        }
    ];

    console.log("🚀 Generating Mini Quiz...");

    const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: userContent,
            },
        ],
        response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content returned from OpenAI response.");

    const jsonContent = content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const result = JSON.parse(jsonContent);

    console.log("✅ Mini Quiz generated successfully");

    // Store the mark scheme for PDF generation
    const markScheme = result.markScheme;

    // Convert the response to GeneratedQuestion format
    const questions: GeneratedQuestion[] = [];

    if (result.questions && Array.isArray(result.questions)) {
        result.questions.forEach((q: any, index: number) => {
            // Determine AO level based on education level and question index
            let aoLevel: "AO1" | "AO2" | "AO3";
            if (educationLevel === "GCSE") {
                if (index < 10) aoLevel = "AO1";
                else if (index < 16) aoLevel = "AO2";
                else aoLevel = "AO3";
            } else { // A-LEVEL
                if (index < 8) aoLevel = "AO1";
                else if (index < 18) aoLevel = "AO2";
                else aoLevel = "AO3";
            }

            questions.push({
                text: q.text,
                type: q.type || "SHORT_ANSWER",
                maxMarks: q.maxMarks || 1,
                topic: result.topicName || "Mini Quiz",
                questionNumber: index + 1,
                aoLevel: q.aoLevel || aoLevel,
                markScheme: markScheme // Store mark scheme in questions array for PDF access
            });
        });
    }

    return questions;
}

// ============================================================================
// CONCURRENT API CALLS WORKFLOW - 3 separate calls, each returning 10 MCQs
// ============================================================================

/**
 * Generate 10 questions for a single topic using concurrent API calls
 */
async function generateTopicQuestions(
    client: OpenAI,
    image: string,
    topicName: string,
    topicDescription: string,
    educationLevel: "GCSE" | "A-LEVEL"
): Promise<{
    name: string;
    questions: Array<{
        question: string;
        options: string[];
    }>;
    answer_key: string[];
}> {
    const levelDisplay = educationLevel === "GCSE" ? "GCSE" : "A-Level";

    const prompt = `You are generating a ready-to-use ${levelDisplay} retrieval quiz for a single topic. Treat this as a final deliverable that students can use immediately.\n\n🔹 Format Requirements\n● Generate EXACTLY 10 multiple-choice questions for ${topicName}: Use a topic name based on image\n● Plain text only (no markdown, tables, or images)\n● Base all questions on the content in the submitted revision-guide image\n\n🔹 Question Structure\n● Each topic must include:\n ○ 5 AO1 questions (recall of facts/content)\n ○ 5 AO2 questions (application/data/one-sentence cause-effect reasoning)\n● Each question must:\n ○ Be multiple choice with 1 correct answer + 3 plausible distractors\n ○ Be short and answerable in under 30 seconds\n ○ Have only one unambiguously correct answer\n ○ Use distractors that reflect real misconceptions, not obviously incorrect ideas and test their deep conceptual understanding of the topic\n\n🔹 AO2 Question Requirements\nAO2 questions (questions 6–10 in each topic) must include:\n● Application of knowledge to an unfamiliar example AND at least one other AO2 feature below\n● Interpretation of data, results, observations, or experimental outcomes\n● A cause/effect or "why" question ONLY when linked to a specific scenario, result, or change in conditions (multiple choice format)\n● Each AO2 question must involve reasoning beyond recall and require students to apply concepts in context\n● Difficulty should be hard and match real exam AO2 standards\n● No AO1 recall, definitions, or memorized facts shall be disguised as AO2 under any circumstances\n● All AO2 questions shall assess different applied concepts from the image; repetition of the same idea in different wording is not allowed\n● Avoid AO3 evaluative, opinion-based, or essay-style questions\n● If a question can be answered correctly by memorizing a single textbook sentence, it is NOT AO2\n\n❗ Do NOT:\n● Label which option is correct\n● Mention which questions are AO1/AO2 in the quiz\n● Add any explanations in the quiz\n\n📎 Requirements For Answers\n● At the very end of the document, after all 10 questions, include an answer key only\n● The position of the correct answer should be random\n● The correct answer for a particular question should never be in the same position as the previous question\n● Before generating any questions, create a random 10 letter sequence using the letters a,b,c,d. There must be roughly even amount of each letter\n● This sequence will be the answer key and determine the position of the correct answer\n● Do not show any planning steps\n● Do not list or label which answers are correct until the answer key\n\nPlease generate the quiz in a JSON structure with the following format:\n{\n "name": "${topicName}",\n "questions": [\n {"question": "", "options": ["", "", "", ""]}\n ],\n "answer_key": ["", "", "", ... 10 letters total]\n}`;

    const userContent = [
        { type: "text" as const, text: prompt },
        {
            type: "image_url" as const,
            image_url: {
                url: image,
                detail: "high" as const
            }
        }
    ];

    const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: userContent,
            },
        ],
        response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content returned from OpenAI response.");

    const jsonContent = content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const topicData = JSON.parse(jsonContent);

    return topicData;
}

/**
 * Generate a complete 30-question retrieval quiz from 3 images using concurrent API calls
 */
export async function generateCompleteRetrievalQuiz(
    apiKey: string,
    images: [string, string, string],
    educationLevel: "GCSE" | "A-LEVEL"
): Promise<{
    title: string;
    topics: Array<{
        name: string;
        questions: Array<{
            question: string;
            options: string[];
        }>;
    }>;
    answer_key: string[];
}> {
    const client = new OpenAI({
        apiKey,
        baseURL: "https://api.openai.com/v1",
    });

    console.log("🚀 Starting concurrent API calls for 3 topics...");

    // Define topic information
    const topicInfo = [
        { name: "Topic A", description: "revised last week, first picture" },
        { name: "Topic B", description: "revised 2–3 weeks ago, second picture" },
        { name: "Topic C", description: "revised 4+ weeks ago, third picture" }
    ];

    // Make concurrent API calls for all 3 topics
    const topicPromises = images.map((image, index) =>
        generateTopicQuestions(
            client,
            image,
            topicInfo[index].name,
            topicInfo[index].description,
            educationLevel
        )
    );

    console.log("⏳ Waiting for all 3 API calls to complete...");
    const topicResults = await Promise.all(topicPromises);
    console.log("✅ All 3 API calls completed successfully");

    // Combine all answer keys into a single 30-letter sequence
    const combinedAnswerKey: string[] = [];
    topicResults.forEach(topic => {
        combinedAnswerKey.push(...topic.answer_key);
    });

    // Create the final quiz structure
    const quiz = {
        title: `Retrieval Quiz – ${new Date().toLocaleDateString()}`,
        topics: topicResults.map(topic => ({
            name: topic.name,
            questions: topic.questions
        })),
        answer_key: combinedAnswerKey
    };

    console.log(`📊 Combined quiz: ${quiz.topics.length} topics, ${combinedAnswerKey.length} total questions`);

    // AFTER quiz completion: Extract text from first image for analysis (non-blocking)
    // console.log("📝 Starting text extraction analysis (after quiz completion)...");
    // extractTextFromImage(apiKey, images[0])
    //     .then(textExtraction => {
    //         console.log("\n" + "=".repeat(80));
    //         console.log("📊 TEXT EXTRACTION METRICS FOR IMAGE 1:");
    //         console.log("=".repeat(80));
    //         console.log("📄 EXTRACTED TEXT:");
    //         console.log(textExtraction.extractedText);
    //         console.log("\n📈 ANALYSIS METRICS:");
    //         console.log(`   • Extraction Percentage: ${textExtraction.extractionPercentage}%`);
    //         console.log(`   • Total Words Extracted: ${textExtraction.totalWords}`);
    //         console.log(`   • Confidence Level: ${textExtraction.confidence}`);
    //         console.log(`   • Readability Score: ${textExtraction.readabilityScore}`);
    //         console.log("🚨 UNCLEAR AREAS:");
    //         textExtraction.unclearAreas.forEach((area, index) => {
    //             console.log(`   ${index + 1}. ${area}`);
    //         });
    //         console.log("=".repeat(80) + "\n");
    //     })
    //     .catch(error => {
    //         console.error("❌ Text extraction failed:", error);
    //     });

    return quiz;
}

/**
 * Convert demo quiz format to GeneratedQuestion format for PDF generation
 */
function convertQuizToGeneratedQuestions(quiz: {
    title: string;
    topics: Array<{
        name: string;
        questions: Array<{
            question: string;
            options: string[];
        }>;
    }>;
    answer_key: string[];
}): GeneratedQuestion[] {
    const questions: GeneratedQuestion[] = [];
    let questionIndex = 0;

    const letterToIndex = { a: 0, b: 1, c: 2, d: 3 } as const;

    quiz.topics.forEach((topic) => {
        topic.questions.forEach((question, qIndex) => {
            const answerLetter = quiz.answer_key[questionIndex];
            const correctAnswer = letterToIndex[answerLetter as keyof typeof letterToIndex];

            questions.push({
                text: question.question,
                type: "MULTIPLE_CHOICE" as const,
                options: question.options,
                correctAnswer,
                maxMarks: 1,
                topic: topic.name,
                questionNumber: qIndex + 1
            });

            questionIndex++;
        });
    });

    return questions;
}

/**
 * Generate and shuffle a complete retrieval quiz using concurrent API calls
 */
export async function generateAndShuffleRetrievalQuiz(
    apiKey: string,
    images: [string, string, string],
    educationLevel: "GCSE" | "A-LEVEL"
): Promise<{
    questions: GeneratedQuestion[];
    originalAnswerKey: string[];
    shuffledAnswerKey: string[];
}> {
    // Import the shuffle function
    const { shuffleQuiz } = await import('./shuffle-quiz');

    // Generate the original quiz using concurrent API calls
    const originalQuiz = await generateCompleteRetrievalQuiz(apiKey, images, educationLevel);
    console.log(originalQuiz);

    // Apply shuffling using the exact demo logic
    const shuffledQuiz = shuffleQuiz(originalQuiz);

    // Convert to GeneratedQuestion format for PDF generation
    const questions = convertQuizToGeneratedQuestions(shuffledQuiz);

    return {
        questions,
        originalAnswerKey: originalQuiz.answer_key,
        shuffledAnswerKey: shuffledQuiz.answer_key
    };
}