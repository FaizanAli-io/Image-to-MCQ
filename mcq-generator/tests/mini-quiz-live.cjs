// Opt-in paid smoke test, excluded from *.test.cjs.
// node --env-file=.env.local tests/mini-quiz-live.cjs A-LEVEL page1.png page2.png output-dir
const fs = require('node:fs/promises');
const path = require('node:path');
const OpenAI = require('openai');
const { loadModule } = require('./load-module.cjs');

async function main() {
  const [level, ...args] = process.argv.slice(2);
  if (!['GCSE', 'A-LEVEL'].includes(level) || args.length < 2 || args.length > 3 || !process.env.OPENAI_API_KEY) {
    throw new Error('Supply a level, one or two source image paths, output directory and API key.');
  }
  const output = path.resolve(args.pop());
  const images = await Promise.all(args.map(async file => {
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(file).toLowerCase()];
    if (!mime) throw new Error('Unsupported image extension');
    return `data:${mime};base64,${(await fs.readFile(file)).toString('base64')}`;
  }));
  const calls = [];
  class ObservedOpenAI extends OpenAI {
    constructor(options) {
      super(options);
      const create = this.chat.completions.create.bind(this.chat.completions);
      this.chat.completions.create = async payload => {
        const started = Date.now();
        const response = await create(payload);
        calls.push({ section: payload.response_format.json_schema.name.slice(-3), model: payload.model, milliseconds: Date.now() - started,
          usage: response.usage, content: response.choices[0]?.message.content });
        return response;
      };
    }
  }
  const { generateMiniQuiz } = loadModule('lib/openai.ts', { openai: { __esModule: true, default: ObservedOpenAI } });
  await fs.mkdir(output, { recursive: true });
  let questions;
  const start = Date.now();
  try {
    questions = await generateMiniQuiz(process.env.OPENAI_API_KEY, images, level);
  } finally {
    await fs.writeFile(path.join(output, 'audit.json'), JSON.stringify({ level, sourceFiles: args, success: !!questions, milliseconds: Date.now() - start, calls }, null, 2));
  }
  const { generatePDF } = loadModule('lib/pdf-utils.ts');
  await fs.writeFile(path.join(output, 'quiz.json'), JSON.stringify(questions, null, 2));
  await fs.writeFile(path.join(output, 'quiz-and-mark-scheme.pdf'), Buffer.from(generatePDF(questions).output('arraybuffer')));
  console.log(JSON.stringify({ level, questions: questions.length, calls: calls.length, milliseconds: Date.now() - start }));
}
main().catch(error => {
  console.error(`${error.name}: ${error.message}${error.cause instanceof Error ? ` (${error.cause.message})` : ''}`);
  process.exitCode = 1;
});
