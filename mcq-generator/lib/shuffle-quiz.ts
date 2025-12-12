/**
 * Utility to shuffle quiz options and update the answer key in place
 * Based on demo/shuffleQuiz.js - exact same logic converted to TypeScript
 */

const LETTERS = ["a", "b", "c", "d"] as const;
const letterToIndex = { a: 0, b: 1, c: 2, d: 3 } as const;

// Fisher-Yates shuffle that works on a copy
function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface QuizQuestion {
  question: string;
  options: string[];
}

interface QuizTopic {
  name: string;
  questions: QuizQuestion[];
}

interface QuizData {
  title: string;
  topics: QuizTopic[];
  answer_key: string[];
}

export function shuffleQuiz(quiz: QuizData): QuizData {
  if (!quiz || !Array.isArray(quiz.topics) || !Array.isArray(quiz.answer_key)) {
    throw new Error("Quiz object must include topics[] and answer_key[].");
  }

  const updatedAnswerKey: string[] = [];
  let flatIndex = 0;

  const topics = quiz.topics.map((topic) => {
    const questions = topic.questions.map((question) => {
      if (!Array.isArray(question.options) || question.options.length !== 4) {
        throw new Error(
          `Question at index ${flatIndex} must have exactly 4 options.`
        );
      }

      const answerChar = quiz.answer_key[flatIndex];
      const correctOriginalIndex = letterToIndex[answerChar as keyof typeof letterToIndex];

      if (correctOriginalIndex === undefined) {
        throw new Error(
          `Invalid answer key entry '${answerChar}' at position ${
            flatIndex + 1
          }.`
        );
      }

      // Track original indices so duplicates are handled safely
      const optionsWithIndex = question.options.map((text, idx) => ({
        text,
        originalIndex: idx
      }));
      const shuffled = shuffleArray(optionsWithIndex);

      const newCorrectIndex = shuffled.findIndex(
        (opt) => opt.originalIndex === correctOriginalIndex
      );
      if (newCorrectIndex === -1) {
        throw new Error(
          `Could not locate correct option after shuffling question ${
            flatIndex + 1
          }.`
        );
      }

      updatedAnswerKey.push(LETTERS[newCorrectIndex]);
      flatIndex += 1;

      return {
        ...question,
        options: shuffled.map((opt) => opt.text)
      };
    });

    return { ...topic, questions };
  });

  return {
    ...quiz,
    topics,
    answer_key: updatedAnswerKey
  };
}