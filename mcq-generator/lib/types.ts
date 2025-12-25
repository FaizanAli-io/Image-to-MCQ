export interface GeneratedQuestion {
  text: string;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | "LONG_ANSWER";
  options?: string[];
  correctAnswer?: number;
  maxMarks?: number;
  image?: string;
  topic?: string; // Topic label (e.g., "Topic A: Cell Biology")
  questionNumber?: number; // Question number within the quiz
  aoLevel?: "AO1" | "AO2" | "AO3" | "REFLECTION"; // Assessment Objective level
  markScheme?: any; // Mark scheme data for Mini Quiz
}

export interface TopicQuestions {
  topicTitle: string; // e.g., "Topic A: Cell Biology"
  topicLabel: string; // e.g., "Topic A"
  questions: GeneratedQuestion[];
  answerSequence: string; // 10-letter sequence for this topic (e.g., "abcdcbadcb")
}

export interface QuizConfig {
  questionCount: number;
  questionType: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | "LONG_ANSWER" | "MIXED";
  educationLevel: "GCSE" | "A-LEVEL";
  quizType: "retrieval" | "mini" | "assignment" | "application" | "marks-per-point" | "specific";
}

export interface GenerateQuestionsRequest {
  imageBase64: string | string[];
  config: QuizConfig;
  customPrompt?: string;
}