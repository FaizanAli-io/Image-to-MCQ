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

    const prompt = `You are generating a ready-to-use ${levelDisplay} retrieval quiz for a single topic. Treat this as a final deliverable that students can use immediately.\n\n🔹 Format Requirements\n● Generate EXACTLY 10 multiple-choice questions for ${topicName}: Use a topic name based on image\n● Plain text only (no markdown, tables, or images)\n● Base all questions on the content in the submitted revision-guide image\n\n🔹 Question Structure\n● Each topic must include:\n ○ 5 AO1 questions (recall of facts/content)\n ○ 5 AO2 questions (application/data/one-sentence cause-effect reasoning)\n● Each question must:\n ○ Be multiple choice with 1 correct answer + 3 plausible distractors\n ○ Be short and answerable in under 30 seconds\n ○ Have only one unambiguously correct answer\n ○ Use distractors that reflect real misconceptions, not obviously incorrect ideas and test their deep conceptual understanding of the topic\n\n🔹 AO2 Question Requirements\nAO2 questions (questions 6–10 in each topic) must include:\n● Application of knowledge to an unfamiliar example, OR\n● Interpretation of data, OR\n● A one-sentence cause/effect or "why" question (multiple choice format)\n● Difficulty should be hard\n● No AO1 questions shall be disguised in as AO2 strictly\n● All questions shall not assess similar concepts different and difficult concepts from the image shall be assessed \n● Avoid AO3 evaluative or essay-style questions\n\n❗ Do NOT:\n● Label which option is correct\n● Mention which questions are AO1/AO2 in the quiz\n● Add any explanations in the quiz\n\n📎 Requirements For Answers\n● At the very end of the document, after all 10 questions, include an answer key only\n● The position of the correct answer should be random\n● The correct answer for a particular question should never be in the same position as the previous question\n● Before generating any questions, create a random 10 letter sequence using the letters a,b,c,d. There must be roughly even amount of each letter\n● This sequence will be the answer key and determine the position of the correct answer\n● Do not show any planning steps\n● Do not list or label which answers are correct until the answer key\n\nPlease generate the quiz in a JSON structure with the following format:\n{\n "name": "${topicName}",\n "questions": [\n {"question": "", "options": ["", "", "", ""]}\n ],\n "answer_key": ["", "", "", ... 10 letters total]\n}`;

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