const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./load-module.cjs');
const errors = loadModule('lib/retrieval-quiz-errors.ts');

function fixture(topic = 'topic0') {
  return {
    name: topic,
    questions: Array.from({ length: 10 }, (_, i) => ({
      question: `Question about ${topic} item${i + 1}?`,
      correct_answer: `Correct ${topic} item${i + 1}`,
      distractors: ['First', 'Second', 'Third'].map(s => `${s} distractor ${topic} item${i + 1}`),
      source_evidence: `Source fact for ${topic} item${i + 1}`,
    })),
  };
}
function completion(value) {
  return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] };
}
function harness(intercept = async () => undefined) {
  const calls = [];
  const attempts = {};
  const api = loadModule('lib/retrieval-quiz.ts', {
    './retrieval-quiz-errors': errors,
    openai: class {
      constructor(options) {
        assert.equal(options.timeout, 45000);
        assert.equal(options.maxRetries, 0);
      }
      chat = { completions: { create: async (payload) => {
        calls.push(payload);
        const content = payload.messages[1].content;
        const image = content.find(p => p.type === 'image_url').image_url.url;
        const topic = image.split('/').at(-1);
        const kind = payload.response_format.json_schema.name;
        const count = attempts[`${topic}:${kind}`] = (attempts[`${topic}:${kind}`] || 0) + 1;
        assert.equal(kind, 'retrieval_topic', 'No AI review or repair calls are allowed');
        const value = fixture(topic);
        return (await intercept({ payload, topic, kind, count, value })) ?? completion(value);
      } } };
    },
  });
  return { ...api, calls, attempts };
}
const images = ['https://example.test/topic0', 'https://example.test/topic1', 'https://example.test/topic2'];

for (const level of ['GCSE', 'A-LEVEL']) {
  test(`${level}: one generation call per topic preserves answers through shuffle and PDF export`, async () => {
    const api = harness(async ({ topic, kind }) => {
      if (kind === 'retrieval_topic' && topic === 'topic0') await new Promise(resolve => setTimeout(resolve, 15));
    });
    const result = await api.generateAndShuffleRetrievalQuiz('test-only', images, level);
    assert.equal(api.calls.length, 3);
    assert.equal(result.questions.length, 30);
    for (const payload of api.calls) {
      assert.equal(payload.response_format.type, 'json_schema');
      assert.equal(payload.response_format.json_schema.strict, true);
      assert.equal(payload.model, 'gpt-5.4-2026-03-05');
      assert.equal(payload.reasoning_effort, 'low');
      assert.match(payload.messages[1].content[0].text, new RegExp(level));

    }
    for (const [i, q] of result.questions.entries()) {
      const topic = `topic${Math.floor(i / 10)}`;
      assert.equal(q.topic, topic);
      assert.equal(q.options[q.correctAnswer], `Correct ${topic} item${i % 10 + 1}`);
      assert.equal(q.aoLevel, undefined, 'Keep the retrieval PDF layout');
      assert.equal(result.shuffledAnswerKey[i], 'abcd'[q.correctAnswer]);
      if (i > 0) assert.notEqual(result.shuffledAnswerKey[i], result.shuffledAnswerKey[i - 1]);
    }
    for (const letter of 'abcd') {
      assert.ok([7, 8].includes(result.shuffledAnswerKey.filter(l => l === letter).length));
    }
    const { generatePDF, generateAnswerKey } = loadModule('lib/pdf-utils.ts');
    const { extractText } = require('unpdf');
    const snapshot = JSON.stringify(result.questions);
    const quiz = await extractText(new Uint8Array(generatePDF(result.questions).output('arraybuffer')), { mergePages: true });
    const key = await extractText(new Uint8Array(generateAnswerKey(result.questions).output('arraybuffer')), { mergePages: true });
    for (const [i, q] of result.questions.entries()) {
      const answer = `${'ABCD'[q.correctAnswer]}) ${q.options[q.correctAnswer]}`;
      assert.ok(quiz.text.includes(answer), `Quiz option ${i + 1}`);
      assert.ok(key.text.includes(`${i + 1}. ${answer}`), `Answer key ${i + 1}`);
    }
    assert.equal(JSON.stringify(result.questions), snapshot, 'PDF export must not mutate options');
  });
}

test('rejects malformed responses locally without accepting a separate answer key', () => {
  const { validateRetrievalTopic } = harness();
  for (const mutate of [
    t => t.questions.pop(),
    t => t.questions.push(t.questions[0]),
    t => t.questions[0].distractors.pop(),
    t => t.questions[0].distractors[0] = `  ${t.questions[0].correct_answer.toUpperCase()}  `,
    t => t.questions[0].correct_answer = '',
    t => t.questions[0].correct_answer = undefined,
    t => t.questions[0].source_evidence = '',
    t => t.questions[0].distractors[0] = 'B) Prelabelled option',
    t => t.questions[1].question = t.questions[0].question,
    t => t.questions[0] = null,
  ]) {
    const value = fixture(); mutate(value);
    value.answer_key = Array(10).fill('a');
    assert.throws(() => validateRetrievalTopic(value));
  }
});

test('malformed responses fail locally without regeneration or AI review', async () => {
  const api = harness(async ({ value }) => { value.questions[0].distractors = []; });
  await assert.rejects(api.generateAndShuffleRetrievalQuiz('test-only', images, 'GCSE'), errors.RetrievalQuizValidationError);
  assert.equal(api.calls.length, 3);
});

test('refusal, truncation, missing content and API errors never trigger extra calls', async t => {
  for (const mode of ['refusal', 'length', 'empty', 'outage', 'invalid-json']) {
    await t.test(mode, async () => {
      const api = harness(async () => {
        if (mode === 'outage') throw new Error('Generation service unavailable');
        if (mode === 'refusal') return { choices: [{ finish_reason: 'stop', message: { refusal: 'Refused' } }] };
        if (mode === 'length') return { choices: [{ finish_reason: 'length', message: { content: '{}' } }] };
        return { choices: [{ finish_reason: 'stop', message: { content: mode === 'empty' ? null : '{' } }] };
      });
      await assert.rejects(api.generateAndShuffleRetrievalQuiz('test-only', images, 'GCSE'));
      assert.equal(api.calls.length, 3);
    });
  }
});

test('all three topics start concurrently and a failure waits for in-flight generation before cleanup', async () => {
  let started = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let finished = 0;
  const api = harness(async ({ topic }) => {
    started++;
    if (started === 3) release();
    await gate;
    if (topic === 'topic0') throw new Error('First topic failed');
    await new Promise(resolve => setTimeout(resolve, 20));
    finished++;
  });
  await assert.rejects(api.generateAndShuffleRetrievalQuiz('test-only', images, 'GCSE'), /First topic failed/);
  assert.equal(started, 3);
  assert.equal(finished, 2);
});

test('long retrieval questions and all four options remain visible across PDF page boundaries', async () => {
  const { generatePDF, generateAnswerKey } = loadModule('lib/pdf-utils.ts');
  const { extractText, getDocumentProxy } = require('unpdf');
  const questions = Array.from({ length: 30 }, (_, i) => ({
    text: `Question ${i + 1}: ` + 'Use the supplied experimental observations to explain the result. '.repeat(i === 0 ? 100 : 4),
    type: 'MULTIPLE_CHOICE', topic: `Topic ${Math.floor(i / 10) + 1}`,
    options: ['Alpha', 'Beta', 'Gamma', 'Delta'].map((name, j) => `${name} option for question ${i + 1}: `
      + 'The evidence supports this interpretation of the experimental results. '.repeat(i === 1 && j === 3 ? 80 : 2)),
    correctAnswer: 3,
  }));
  for (const [name, doc] of [['quiz', generatePDF(questions)], ['key', generateAnswerKey(questions)]]) {
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    const extracted = await extractText(bytes.slice(), { mergePages: true });
    const compact = extracted.text.replace(/\s/g, '');
    for (const [i, q] of questions.entries()) {
      for (const [j, option] of q.options.entries()) {
        if (name === 'key' && j !== q.correctAnswer) continue;
        assert.ok(compact.includes(`${'ABCD'[j]}) ${option}`.replace(/\s/g, '')), `${name} Q${i + 1} option ${j + 1} must be visible`);
      }
    }
    const proxy = await getDocumentProxy(bytes.slice());
    try {
      for (let pageNumber = 1; pageNumber <= proxy.numPages; pageNumber++) {
        const page = await proxy.getPage(pageNumber);
        const height = page.getViewport({ scale: 1 }).height;
        const content = await page.getTextContent();
        for (const item of content.items) {
          if (item.str?.trim()) assert.ok(item.transform[5] >= 15 && item.transform[5] <= height - 15, `${name}: off-page text on page ${pageNumber}`);
        }
      }
    } finally { await proxy.destroy(); }
  }
});

test('retrieval PDFs preserve micrometre units and negative exponents', async () => {
  const { generatePDF, generateAnswerKey } = loadModule('lib/pdf-utils.ts');
  const { extractText } = require('unpdf');
  const questions = [{ text: 'Compare organisms in 1 mol dm−3 solution.', type: 'MULTIPLE_CHOICE',
    options: ['the 5 μm organism', 'the 50 μm organism', 'both organisms', 'neither organism'], correctAnswer: 0 }];
  for (const doc of [generatePDF(questions), generateAnswerKey(questions)]) {
    const { text } = await extractText(new Uint8Array(doc.output('arraybuffer')), { mergePages: true });
    assert.match(text, /A\) the 5 [µμ]m organism/);
    assert.doesNotMatch(text, /¼m/);
    if (text.includes('Compare')) assert.match(text, /dm-3/);
  }
});
