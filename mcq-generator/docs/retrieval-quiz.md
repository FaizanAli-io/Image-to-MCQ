# Retrieval quiz generation

Retrieval uses one AI generation call for each of three source images, all started concurrently. There is no second AI review, repair loop, or automatic API retry. Mini-quiz generation is documented separately in mini-quiz/README.md.

## Answer integrity

The generator returns ten questions per source (five AO1, five AO2). Each question contains a short supporting source fact, its correct answer text and three distractors. It does not produce answer letters or a separate key.

The prompt requires precise scope, relevant source facts, one unambiguously correct option, and plausible distractors that are false under the actual wording. It explicitly addresses scientific exceptions such as multiple organelles containing DNA and different bacterial fermentation products. AO2 requires applying a concept to supplied conditions or data.

Local, non-AI checks validate counts, non-empty fields, distinct options and question text. These checks do not assess factual correctness. Malformed/incomplete output returns a generation error; it is never misrepresented as a failed AI review.

Code shuffles options while preserving the selected answer, balances letters across the quiz, and derives the answer-key PDF from the same question objects. This prevents letter mismatches introduced by shuffling/export; it cannot prove that the model's answer is scientifically correct.

The retrieval PDF pagination and scientific-unit fixes are retained. Long questions and options continue onto the next page without clipping. Retrieval output omits aoLevel because the existing shared renderer uses it to choose the mini-quiz layout.

## Latency and limits

The pinned model is gpt-5.4-2026-03-05, with low reasoning effort and a 5,000 completion-token cap per call. The SDK timeout is 45 seconds per request, with maxRetries set to zero. Because all three requests run concurrently, their durations do not add together. Source upload/download, cleanup and network overhead are additional.

The route declares maxDuration = 90 seconds where supported. This does not change a Cloudflare proxy timeout or override hosting-plan limits. There is no guarantee of a particular end-to-end latency. Failed requests wait for other in-flight topic requests before cleaning up their source images.

The route still accepts exactly three images. A URL/transcript input path is not part of this change.

## Verification

From mcq-generator:

```powershell
node --test tests/*.test.cjs
npx tsc --noEmit --incremental false
npx eslint lib/retrieval-quiz.ts lib/retrieval-quiz-errors.ts app/api/generate-questions-r2/route.ts
```

Tests cover concurrent requests, zero retries, the request timeout, answer preservation through shuffle and PDF extraction, malformed responses, source cleanup, pagination and scientific units.

The optional live script makes paid API calls and writes generated quiz/key PDFs, JSON and request timings. Use a fresh output directory; failed runs do not remove older artifacts:

```powershell
node --env-file=.env.local tests/retrieval-live.cjs GCSE page-a.png page-b.png page-c.png ../.tmp-qa/retrieval/GCSE-single-pass
node --env-file=.env.local tests/retrieval-live.cjs A-LEVEL page-a.png page-b.png page-c.png ../.tmp-qa/retrieval/A-LEVEL-single-pass
```

## Verification limits

Synthetic biology smoke tests do not establish accuracy across all subjects, source pages or exam levels. Manual inspection during development found possible content/wording problems. Code prevents answer-letter mismatches during shuffling and export; it cannot guarantee the scientific correctness of model-generated answers. No independent AI review is performed in production.
