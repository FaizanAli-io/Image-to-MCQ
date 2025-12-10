// Utility to shuffle quiz options and update the answer key in place
// Accepts quiz JSON shaped like output.json and returns a new object with shuffled options and a new answer_key

const LETTERS = ["a", "b", "c", "d"];
const letterToIndex = { a: 0, b: 1, c: 2, d: 3 };

// Fisher-Yates shuffle that works on a copy
function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function shuffleQuiz(quiz) {
  if (!quiz || !Array.isArray(quiz.topics) || !Array.isArray(quiz.answer_key)) {
    throw new Error("Quiz object must include topics[] and answer_key[].");
  }

  const updatedAnswerKey = [];
  let flatIndex = 0;

  const topics = quiz.topics.map((topic) => {
    const questions = topic.questions.map((question) => {
      if (!Array.isArray(question.options) || question.options.length !== 4) {
        throw new Error(
          `Question at index ${flatIndex} must have exactly 4 options.`
        );
      }

      const answerChar = quiz.answer_key[flatIndex];
      const correctOriginalIndex = letterToIndex[answerChar];

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
