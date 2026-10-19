import { MINI_QUIZ_CLIENT_REQUIREMENTS } from './mini-quiz-client-requirements';
import OpenAI from "openai";
import { GeneratedQuestion } from "./types";
import { getMiniQuizAO2Prompt } from "./mini-quiz-prompts";
import { getMiniQuizAO3Prompt, AO3_JSON_INTEGRATION } from "./mini-quiz-ao3-prompts";
import { validateAO3Result } from "./mini-quiz-stimuli";
import { normalizeMiniQuizStimulus } from './mini-quiz-normalize';
import { getMiniQuizSectionSchema } from "./mini-quiz-schema";
import { MiniQuizEvidenceError } from "./mini-quiz-errors";
import { miniQuizCounts } from "./mini-quiz-config";
import { reconcileMiniQuizMarks, type MiniQuizDraft } from "./mini-quiz-marks";

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

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
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
                content: userContent,
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
// MINI QUIZ WORKFLOW - One or two pages, one parallel generation per AO section
// ============================================================================

/**
 * Generate a Mini Quiz from one or two pages combined into one quiz
 */
export async function generateMiniQuiz(
    apiKey: string,
    imageUrls: string[],
    educationLevel: "GCSE" | "A-LEVEL"
): Promise<GeneratedQuestion[]> {
    const client = new OpenAI({ apiKey, timeout: 75_000, maxRetries: 0 });
    const counts = miniQuizCounts(educationLevel);
    const sections = ['ao1', 'ao2', 'ao3'] as const;
    const responses = await Promise.allSettled(sections.map(async section => {
        const transport = `Create only the ${section.toUpperCase()} section of ONE ${educationLevel} mini quiz from all supplied source pages. When two pages are supplied, use relevant content from BOTH pages. Generate EXACTLY ${counts[section]} questions.
The next text block, when present, is the client's complete verbatim prompt and governs the educational content. Use JSON only as the output encoding; preserve its scientific and pedagogical requirements.
Use local question numbers 1-${counts[section]} in the mark scheme. Do not put question numbers in question.text or refer to other question numbers; the application numbers the combined quiz.
Map the title to topicName, questions to questions, and the student-friendly mark scheme to markScheme. Put each complete AO2 scenario, observation and value in question.text; No separately generated stimulus is needed for AO2.
For ALL sections, use one string ending in [1] for each distinct marking point. Derive maxMarks from the minimum complete answer, not a preset total. Do not invent points, duplicate an idea or artificially split reasoning to fill marks.
${section === 'ao1' ? 'Create short direct recall/understanding questions using only the visible page content. Use define, state, name, identify or describe. Set aoLevel=AO1, requiresStimulus=false, stimulusIds=[], ao3Review=null.' : ''}
${section === 'ao2' ? 'Set aoLevel=AO2, requiresStimulus=false, stimulusIds=[], ao3Review=null.' : ''}
${section === 'ao3' ? AO3_JSON_INTEGRATION : ''}
${MINI_QUIZ_CLIENT_REQUIREMENTS}`;
        const sectionPrompt = section === 'ao2' ? getMiniQuizAO2Prompt(educationLevel)
            : section === 'ao3' ? getMiniQuizAO3Prompt(educationLevel) : undefined;
        const response = await client.chat.completions.create({
            model: "gpt-5.4-2026-03-05",
            reasoning_effort: 'low',
            messages: [{ role: "user", content: [
                { type: "text", text: transport },
                ...(sectionPrompt ? [{ type: "text" as const, text: sectionPrompt }] : []),
                ...imageUrls.map(url => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })),
            ] }],
            response_format: { type: "json_schema", json_schema: {
                name: `mini_quiz_${section}`, strict: true, schema: getMiniQuizSectionSchema(educationLevel, section),
            } },
        });
        try {
            const choice = response.choices[0];
            if (!choice?.message.content || choice.message.refusal || (choice.finish_reason && choice.finish_reason !== "stop")) {
                throw new Error(`${section.toUpperCase()} generation did not return a complete response`);
            }
            const draft = JSON.parse(choice.message.content) as {
                topicName: string; questions: MiniQuizDraft['questions'];
                markScheme: MiniQuizDraft['markScheme']['ao1']; stimuli?: unknown[];
            };
            if (!Array.isArray(draft.questions) || draft.questions.length !== counts[section]
                || !Array.isArray(draft.markScheme) || draft.markScheme.length !== counts[section]) {
                throw new Error(`${section.toUpperCase()}: incorrect section count`);
            }
            draft.questions.forEach((question, index) => {
                // A model may repeat local numbering despite the transport instructions.
                // Remove only that explicit prefix; preserve numbers within the question.
                const prefix = new RegExp(`^(?:Question\\s+${index + 1}[.):]?\\s+|${index + 1}[.)]\\s+)`, 'i');
                question.text = question.text.replace(prefix, '');
            });
            const seen = new Set<number>();
            for (const entry of draft.markScheme) {
                if (!Number.isInteger(entry.questionNumber) || entry.questionNumber < 1
                    || entry.questionNumber > counts[section] || seen.has(entry.questionNumber)) {
                    throw new Error(`${section.toUpperCase()}: incorrect local marking number`);
                }
                seen.add(entry.questionNumber);
            }
            return draft;
        } catch (error) {
            throw new MiniQuizEvidenceError(error);
        }
    }));
    // Wait for every image-consuming request before the route cleans up uploads.
    // Transport failures retain their original classification; malformed outputs use 422.
    for (const response of responses) {
        if (response.status === 'rejected') throw response.reason;
    }
    try {
        const drafts = responses.map(response => {
            if (response.status === 'rejected') throw response.reason;
            return response.value;
        });
        let offset = 0;
        const markSchemeSections = drafts.map((draft, index) => {
            const entries = draft.markScheme.map(entry => ({ ...entry, questionNumber: entry.questionNumber + offset }));
            offset += counts[sections[index]];
            return entries;
        });
        const result: MiniQuizDraft & { stimuli: unknown[] } = {
            topicName: drafts[0].topicName,
            questions: drafts.flatMap(draft => draft.questions),
            stimuli: (drafts[2].stimuli || []).map(normalizeMiniQuizStimulus),
            markScheme: { ao1: markSchemeSections[0], ao2: markSchemeSections[1], ao3: markSchemeSections[2] },
        };
        reconcileMiniQuizMarks(result, educationLevel);
        const evidence = validateAO3Result(result, educationLevel);
        const publicMarks = (entries: MiniQuizDraft['markScheme']['ao1']) => entries.map(({ questionNumber, markPoints, markingGuidance }) => ({ questionNumber, markPoints, ...(markingGuidance ? { markingGuidance } : {}) }));
        const markScheme = { ao1: publicMarks(result.markScheme.ao1), ao2: publicMarks(result.markScheme.ao2), ao3: evidence.markScheme };
        // Private beta specifications and type checks stay out of student views/PDFs.
        return result.questions.map((q, index) => ({
            text: q.text, type: q.type, maxMarks: q.maxMarks,
            topic: result.topicName || "Mini Quiz", questionNumber: index + 1,
            aoLevel: q.aoLevel, educationLevel, markScheme,
            ...(q.aoLevel === "AO3" ? {
                requiresStimulus: evidence.idsByQuestion.get(index + 1)!.length > 0,
                stimulusIds: evidence.idsByQuestion.get(index + 1)!,
                stimuli: evidence.idsByQuestion.get(index + 1)!.map(id => evidence.stimuli.find(s => s.id === id)!),
            } : {}),
        }));
    } catch (error) {
        throw new MiniQuizEvidenceError(error);
    }
}

// Retrieval generation is isolated from the mini-quiz workflow.
export { generateCompleteRetrievalQuiz, generateAndShuffleRetrievalQuiz } from './retrieval-quiz';
