const OPENAI_API_KEY = "";

const prompt =
  'You are generating a ready-to-use GCSE retrieval quiz. Treat this as a final deliverable that students can use immediately.\n\n🔹 Format Requirements\n● Title at the top: “Retrieval Quiz – [INSERT DATE]”\n● Plain text only (no markdown, tables, or images).\n● Total of 30 multiple-choice questions, divided into 3 topics, with 10 questions per topic.\n● Use these headings, based on the submitted revision-guide images:\n  ○ Topic A: [revised last week, first picture]\n  ○ Topic B: [revised 2–3 weeks ago, second picture]\n  ○ Topic C: [revised 4+ weeks ago, third picture]\n\n🔹 Question Structure\n● Each topic must include:\n  ○ 5 AO1 questions (recall of facts/content).\n  ○ 5 AO2 questions (application/data/one-sentence cause-effect reasoning).\n● Each question must:\n  ○ Be multiple choice with 1 correct answer + 3 plausible distractors.\n  ○ Be short and answerable in under 30 seconds.\n  ○ Have only one unambiguously correct answer.\n  ○ Use distractors that reflect real misconceptions, not obviously incorrect ideas and test their deep conceptual understanding of the topic\n\n🔹 AO2 Question Requirements\nAO2 questions (questions 6–10 in each topic) must include:\n● Application of knowledge to an unfamiliar example, OR\n● Interpretation of data, OR\n● A one-sentence cause/effect or “why” question (multiple choice format).\n● Avoid AO3 evaluative or essay-style questions.\n\n❗ Do NOT:\n● Label which option is correct.\n● Mention which questions are AO1/AO2 in the quiz.\n● Add any explanations in the quiz.\n\n📎 Requirements For Answers\n● At the very end of the document, after all 30 questions, include an answer key only.\n● The position of the correct answer should be random\n● The correct answer for a particular question should never be in the same position as the previous question\n● Before generating any questions, create a random 30 letter sequence using the letters a,b,c,d. There must be roughly even amount of each letter\n● This sequence will be the answer key and determine the position of the correct answer\n● Do not show any planning steps.\n● Do not list or label which answers are correct until the answer key.\n\nPlease generate the quiz in a JSON structure with the following format:\n{\n  "title": "Retrieval Quiz – [INSERT DATE]",\n  "topics": [\n    {\n      "name": "Topic A",\n      "questions": [\n        {"question": "", "options": ["", "", "", ""]}\n      ]\n    },\n    {\n      "name": "Topic B",\n      "questions": [\n        {"question": "", "options": ["", "", "", ""]}\n      ]\n    },\n    {\n      "name": "Topic C",\n      "questions": [\n        {"question": "", "options": ["", "", "", ""]}\n      ]\n    }\n  ],\n  "answer_key": ["", "", "", ... 30 letters total]\n}';
import { readFileSync, writeFileSync } from "fs"; // Needed for reading images and writing outputs
import { shuffleQuiz } from "./shuffleQuiz.js";

// --- Utility Function (Place this outside your main function) ---
function fileToBase64(path, mimeType) {
  const file = readFileSync(path);
  const base64String = file.toString("base64");
  // Return in the required OpenAI format: data:[MIME_TYPE];base64,[DATA]
  return `data:${mimeType};base64,${base64String}`;
}

// --- Main Function ---
async function sendQuizPromptWithImages() {
  // 1. Encode images to Base64
  const image1_b64 = fileToBase64("./image1.PNG", "image/png");
  const image2_b64 = fileToBase64("./image2.PNG", "image/png");
  const image3_b64 = fileToBase64("./image3.PNG", "image/png");

  // 2. Structure the message content
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: { url: image1_b64, detail: "low" }
        },
        {
          type: "image_url",
          image_url: { url: image2_b64, detail: "low" }
        },
        {
          type: "image_url",
          image_url: { url: image3_b64, detail: "low" }
        }
      ]
    }
  ];

  // 3. Create the request body
  const requestBody = {
    model: "gpt-4o",
    messages: messages,
    response_format: { type: "json_object" }
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", // Crucial: Send as JSON
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody) // Send the structured JSON body
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("API Error:", errorData);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    console.log(JSON.stringify(data, null, 2));

    // The content is a JSON string *inside* the response object, so parse it.
    // Uncomment this part if the model reliably returns a JSON string in content
    const contentStr = data.choices[0].message.content;
    const quizJSON = JSON.parse(contentStr);

    console.log("\n--- Parsed Quiz JSON ---\n");
    console.log(JSON.stringify(quizJSON, null, 2));

    // Write raw output
    writeFileSync("./output.json", JSON.stringify(quizJSON, null, 2), "utf-8");

    // Shuffle options and update answer key, then write shuffled output
    const shuffledQuiz = shuffleQuiz(quizJSON);
    writeFileSync(
      "./shuffled.json",
      JSON.stringify(shuffledQuiz, null, 2),
      "utf-8"
    );

    console.log(
      "Saved raw quiz to output.json and shuffled quiz to shuffled.json"
    );
  } catch (err) {
    console.error("Error sending request:", err);
  }
}

// Make sure you have image1.PNG, image2.PNG, and image3.PNG in the same directory
sendQuizPromptWithImages();
