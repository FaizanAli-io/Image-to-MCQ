/**
 * Generate a 30-letter answer key sequence for retrieval quizzes
 * with no consecutive duplicates
 */

export function generateRetrievalAnswerSequence(): string {
  // Step 1: Create array with 8 of each letter (32 total, will trim to 30)
  const letters: string[] = [];
  ['a', 'b', 'c', 'd'].forEach(letter => {
    for (let i = 0; i < 8; i++) {
      letters.push(letter);
    }
  });

  // Step 2: Shuffle the array randomly (Fisher-Yates)
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }

  // Step 3: Remove consecutive duplicates
  let maxAttempts = 100;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    let hasConsecutive = false;
    
    // Check for consecutive duplicates
    for (let i = 0; i < letters.length - 1; i++) {
      if (letters[i] === letters[i + 1]) {
        hasConsecutive = true;
        
        // Find a position to swap with that won't create new consecutive duplicates
        let swapped = false;
        for (let j = i + 2; j < letters.length; j++) {
          // Check if swapping won't create new consecutive duplicates
          const wouldCreateConsecutiveBefore = j > 0 && letters[j - 1] === letters[i + 1];
          const wouldCreateConsecutiveAfter = j < letters.length - 1 && letters[j + 1] === letters[i + 1];
          const wouldCreateConsecutiveAtI = letters[i] === letters[j];
          
          if (!wouldCreateConsecutiveBefore && !wouldCreateConsecutiveAfter && !wouldCreateConsecutiveAtI) {
            // Swap
            [letters[i + 1], letters[j]] = [letters[j], letters[i + 1]];
            swapped = true;
            break;
          }
        }
        
        if (!swapped) {
          // If we couldn't find a good swap, reshuffle and try again
          for (let k = letters.length - 1; k > 0; k--) {
            const l = Math.floor(Math.random() * (k + 1));
            [letters[k], letters[l]] = [letters[l], letters[k]];
          }
          break;
        }
      }
    }
    
    if (!hasConsecutive) {
      break;
    }
    
    attempts++;
  }

  // Step 4: Trim to exactly 30 letters
  const sequence = letters.slice(0, 30);

  // Step 5: Validate
  const validation = validateAnswerSequence(sequence);
  if (!validation.isValid) {
    console.warn('Generated sequence failed validation, regenerating...', validation);
    return generateRetrievalAnswerSequence(); // Recursive retry
  }

  // Step 6: Return as string
  return sequence.join('');
}

/**
 * Validate an answer sequence meets all requirements
 */
export function validateAnswerSequence(sequence: string[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check length
  if (sequence.length !== 30) {
    errors.push(`Length must be 30, got ${sequence.length}`);
  }

  // Check for consecutive duplicates
  for (let i = 0; i < sequence.length - 1; i++) {
    if (sequence[i] === sequence[i + 1]) {
      errors.push(`Consecutive duplicate at positions ${i} and ${i + 1}: '${sequence[i]}'`);
    }
  }

  // Check distribution (each letter should appear 7-8 times)
  const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
  sequence.forEach(letter => {
    if (counts[letter] !== undefined) {
      counts[letter]++;
    } else {
      errors.push(`Invalid letter: '${letter}'`);
    }
  });

  Object.entries(counts).forEach(([letter, count]) => {
    if (count < 7 || count > 8) {
      errors.push(`Letter '${letter}' appears ${count} times, should be 7-8`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Convert answer sequence string to array for validation
 */
export function parseAnswerSequence(sequence: string): string[] {
  return sequence.toLowerCase().split('').filter(c => ['a', 'b', 'c', 'd'].includes(c));
}

/**
 * Validate that generated answer key matches expected sequence
 */
export function validateAnswerKey(
  generatedKey: string,
  expectedSequence: string
): {
  isValid: boolean;
  message: string;
  generatedArray?: string[];
  expectedArray?: string[];
} {
  const generatedArray = parseAnswerSequence(generatedKey);
  const expectedArray = parseAnswerSequence(expectedSequence);

  if (generatedArray.length !== expectedArray.length) {
    return {
      isValid: false,
      message: `Length mismatch: generated ${generatedArray.length}, expected ${expectedArray.length}`,
      generatedArray,
      expectedArray
    };
  }

  for (let i = 0; i < generatedArray.length; i++) {
    if (generatedArray[i] !== expectedArray[i]) {
      return {
        isValid: false,
        message: `Mismatch at position ${i + 1}: generated '${generatedArray[i]}', expected '${expectedArray[i]}'`,
        generatedArray,
        expectedArray
      };
    }
  }

  return {
    isValid: true,
    message: 'Answer key matches expected sequence perfectly',
    generatedArray,
    expectedArray
  };
}
