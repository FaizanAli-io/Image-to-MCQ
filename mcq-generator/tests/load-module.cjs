const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadModule(relativePath, mocks = {}) {
  const filename = path.join(__dirname, '..', relativePath);
  const source = readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)((name) => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('./')) {
      const target = path.resolve(path.dirname(filename), name);
      return loadModule(path.relative(path.join(__dirname, '..'), target) + (existsSync(target + '.tsx') ? '.tsx' : '.ts'), mocks);
    }
    if (name.startsWith('@/')) {
      const target = name.slice(2);
      const extension = target.startsWith('components/') ? '.tsx' : '.ts';
      return loadModule(target + extension, mocks);
    }
    if (['jspdf', 'react/jsx-runtime'].includes(name)) return require(name);
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}
module.exports = { loadModule };
