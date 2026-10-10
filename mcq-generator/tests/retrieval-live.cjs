// Opt-in smoke test: makes paid API calls. Not included by --test *.test.cjs.
// node --env-file=.env.local tests/retrieval-live.cjs GCSE a.png b.png c.png output-dir
const fs = require('node:fs/promises');
const path = require('node:path');
const OpenAI = require('openai');
const { loadModule } = require('./load-module.cjs');

async function main() {
  const [level, ...args] = process.argv.slice(2);
  if (!['GCSE', 'A-LEVEL'].includes(level) || args.length !== 4 || !process.env.OPENAI_API_KEY) {
    throw new Error('Provide an API key, GCSE or A-LEVEL, three source image paths, and an output directory.');
  }
  const imagePaths = args.slice(0, 3);
  const outputDir = path.resolve(args[3]);
  const images = await Promise.all(imagePaths.map(async file => {
    const extension = path.extname(file).toLowerCase();
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[extension];
    if (!mime) throw new Error('Sources must be PNG, JPEG, or WebP images.');
    return `data:${mime};base64,${(await fs.readFile(file)).toString('base64')}`;
  }));
  const calls = [];
  class ObservedOpenAI extends OpenAI {
    constructor(options) {
      super(options);
      const create = this.chat.completions.create.bind(this.chat.completions);
      this.chat.completions.create = async payload => {
        const started = Date.now();
        const result = await create(payload);
        calls.push({ stage: payload.response_format.json_schema.name,
          topicIndex: images.indexOf(payload.messages[1].content.find(p => p.type === 'image_url').image_url.url),
          milliseconds: Date.now() - started, usage: result.usage,
          content: result.choices[0]?.message.content });
        console.log(`${calls.at(-1).stage} completed (${calls.at(-1).milliseconds}ms)`);
        return result;
      };
    }
  }
  // OpenAI exposes an inherited .default; explicitly mock the ES module default.
  const api = loadModule('lib/retrieval-quiz.ts', { openai: { __esModule: true, default: ObservedOpenAI } });
  const started = Date.now();
  let result;
  try {
    result = await api.generateAndShuffleRetrievalQuiz(process.env.OPENAI_API_KEY, images, level);
  } finally {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'audit.json'), JSON.stringify({ level, success: !!result, milliseconds: Date.now() - started, calls }, null, 2));
  }
  const { generatePDF, generateAnswerKey } = loadModule('lib/pdf-utils.ts');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'quiz.json'), JSON.stringify(result, null, 2));
  await fs.writeFile(path.join(outputDir, 'quiz.pdf'), Buffer.from(generatePDF(result.questions, `${level} Retrieval Quiz`).output('arraybuffer')));
  await fs.writeFile(path.join(outputDir, 'answer-key.pdf'), Buffer.from(generateAnswerKey(result.questions).output('arraybuffer')));
  const metrics = { level, questionCount: result.questions.length, milliseconds: Date.now() - started,
    calls: calls.map(({ content, ...metric }) => metric) };
  await fs.writeFile(path.join(outputDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify({ level, questionCount: metrics.questionCount, milliseconds: metrics.milliseconds, calls: calls.length }));
}
main().catch(error => {
  // Do not print request objects, image data, environment variables or credentials.
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
