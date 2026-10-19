import { miniQuizCounts } from './mini-quiz-config';
import type { QuizStimulus, StimulusAxis, PlotPoint, PlotSeries, DiagramElement } from './stimulus-types';
import { AO3_TYPES } from './ao3-taxonomy';

export class StimulusValidationError extends Error {
  constructor(message: string) { super(`AO3 output needs correction: ${message}`); }
}
type RecordValue = Record<string, unknown>;
function fail(message: string): never { throw new StimulusValidationError(message); }
function object(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as RecordValue;
}
function array(value: unknown, label: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${label} needs ${min}-${max} entries`);
  return value as unknown[];
}
function text(value: unknown, label: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} must be nonempty text (max ${max} characters)`);
  if (/STIMULUS TO BE INSERTED|BETA REVIEW INFORMATION|BETA \/ DEVELOPER SPECIFICATION/i.test(value)) fail(`${label} contains a developer placeholder`);
  return value.trim();
}
function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12) fail(`${label} must be a finite number`);
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (!choices.includes(value as T)) fail(`${label} must be one of ${choices.join(', ')}`);
  return value as T;
}
function axis(value: unknown, label: string): StimulusAxis {
  const v = object(value, label);
  const min = number(v.min, `${label}.min`), max = number(v.max, `${label}.max`), tickStep = number(v.tickStep, `${label}.tickStep`);
  if (max <= min || tickStep <= 0 || (max - min) / tickStep < 1 || (max - min) / tickStep > 12) fail(`${label} needs an increasing range and 1-12 tick intervals`);
  const intervals = (max - min) / tickStep;
  if (Math.abs(intervals - Math.round(intervals)) > 1e-6) fail(`${label}.tickStep must divide the axis range evenly`);
  if (typeof v.units !== 'string' || v.units.length > 30) fail(`${label}.units must be text, use an empty string for dimensionless axes`);
  return { label: text(v.label, `${label}.label`, 70), units: v.units, min, max, tickStep };
}
function points(value: unknown, xAxis: StimulusAxis, yAxis: StimulusAxis, ordered: boolean, label: string, allowErrors: boolean): PlotPoint[] {
  const result = array(value, label, 2, 60).map((entry, i) => {
    const v = object(entry, `${label}[${i}]`);
    const x = number(v.x, 'point.x'), y = number(v.y, 'point.y');
    const error = v.yError == null ? undefined : number(v.yError, 'point.yError');
    if (error !== undefined && (!allowErrors || error < 0)) fail('error bars must be nonnegative and only attached to data points');
    if (x < xAxis.min || x > xAxis.max || y - (error || 0) < yAxis.min || y + (error || 0) > yAxis.max) fail('axis range must include every point and error bar');
    // Zero-length errors have nothing to draw; models sometimes fill every
    // optional numeric field with zero instead of null.
    return { x, y, ...(error === undefined || error === 0 ? {} : { yError: error }) };
  });
  if (ordered && result.some((point, i) => i > 0 && point.x <= result[i - 1].x)) fail(`${label} x values must be strictly increasing`);
  return result;
}

/** Whitelist fields: model-supplied review notes/code/URLs never enter student stimuli. */
export function parseStimulus(value: unknown, level: 'GCSE' | 'A-LEVEL'): QuizStimulus {
  const v = object(value, 'stimulus');
  const id = text(v.id, 'stimulus.id', 30);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) fail('stimulus.id may contain only letters, digits, underscores and hyphens');
  const base = { id, title: text(v.title, 'stimulus.title', 100), ...(v.context == null ? {} : { context: text(v.context, 'stimulus.context', 1000) }) };
  const kind = choice(v.kind, ['graph', 'table', 'text', 'diagram'] as const, 'stimulus.kind');
  if (kind === 'text') return { ...base, kind, paragraphs: array(v.paragraphs, 'paragraphs', 1, 8).map(p => text(p, 'paragraph', 1000)) };
  if (kind === 'table') {
    const columns = array(v.columns, 'columns', 2, 5).map(c => text(c, 'column heading', 90));
    const rows = array(v.rows, 'rows', 1, 16).map(row => array(row, 'table row', columns.length, columns.length).map(cell => {
      if (typeof cell === 'number') return String(number(cell, 'cell'));
      return text(cell, 'cell', 160);
    }));
    return { ...base, kind, columns, rows };
  }
  if (kind === 'diagram') {
    if (level === 'A-LEVEL') fail('A-level Biology forbids diagrams and biological illustrations');
    const diagramType = choice(v.diagramType, ['apparatus', 'geometry'] as const, 'diagramType');
    const coordinate = (v: unknown, max: number) => { const n = number(v, 'diagram coordinate'); if (n < 0 || n > max) fail('diagram element is outside the 600 x 320 drawing area'); return n; };
    const elements: DiagramElement[] = array(v.elements, 'diagram elements', 1, 45).map(entry => {
      const e = object(entry, 'diagram element');
      const type = choice(e.type, ['rect', 'ellipse', 'line', 'arrow', 'label'] as const, 'diagram element type');
      const x = coordinate(e.x, 600), y = coordinate(e.y, 320);
      if (type === 'line' || type === 'arrow') return { type, x, y, x2: coordinate(e.x2, 600), y2: coordinate(e.y2, 320) };
      if (type === 'label') {
        const label = text(e.text, 'diagram label', 60);
        if (x + label.length * 7 > 600 || y < 14) fail('diagram label needs room within the drawing area');
        return { type, x, y, text: label };
      }
      const width = coordinate(e.width, 600), height = coordinate(e.height, 320);
      if (!width || !height || x + width > 600 || y + height > 320) fail('diagram shape has invalid bounds');
      return { type, x, y, width, height, fill: choice(e.fill, ['none', 'light', 'dark'] as const, 'diagram fill') };
    });
    return { ...base, kind, diagramType, elements };
  }
  const graphType = choice(v.graphType, ['line', 'scatter', 'bar'] as const, 'graphType');
  const xAxis = axis(v.xAxis, 'xAxis'), yAxis = axis(v.yAxis, 'yAxis');
  const series: PlotSeries[] = array(v.series, 'series', 1, 4).map(entry => {
    const s = object(entry, 'series');
    return { name: text(s.name, 'series.name', 65), points: points(s.points, xAxis, yAxis, graphType !== 'scatter', 'series.points', true),
      ...(s.trendPoints == null ? {} : { trendPoints: points(s.trendPoints, xAxis, yAxis, true, 'trendPoints', false) }) };
  });
  if (new Set(series.map(s => s.name)).size !== series.length) fail('series names must be unique');
  if (graphType !== 'scatter' && series.some(s => s.trendPoints)) fail('trendPoints are supported only for scatter graphs');
  const hasErrors = series.some(s => s.points.some(p => p.yError !== undefined));
  const errorDescription = v.errorDescription == null || v.errorDescription === '' ? undefined : text(v.errorDescription, 'errorDescription', 160);
  if (hasErrors && !errorDescription) fail('explain what error bars represent in errorDescription');
  if (graphType === 'bar') {
    const categories = array(v.categories, 'categories', 2, 8).map(c => text(c, 'category', 45));
    if (xAxis.min !== -0.5 || xAxis.max !== categories.length - 0.5 || xAxis.tickStep !== 1) fail('bar xAxis must span -0.5 to categories.length - 0.5, tickStep 1');
    if (yAxis.min > 0 || yAxis.max < 0) fail('bar charts must include zero on the y axis');
    if (series.some(s => s.points.length !== categories.length || s.points.some((p, i) => p.x !== i))) fail('bar points must provide every category in order using x = 0, 1, ...');
    return { ...base, kind, graphType, xAxis, yAxis, series, categories, ...(errorDescription ? { errorDescription } : {}) };
  }
  return { ...base, kind, graphType, xAxis, yAxis, series, ...(errorDescription ? { errorDescription } : {}) };
}

export interface AO3Result {
  stimuli: QuizStimulus[];
  idsByQuestion: Map<number, string[]>;
  marksByQuestion: Map<number, number>;
  markScheme: { questionNumber: number; markPoints: string[]; reasoningToLearn?: string }[];
}

/** Semantic validation runs even when the response is syntactically valid JSON. */
export function validateAO3Result(value: unknown, level: 'GCSE' | 'A-LEVEL'): AO3Result {
  const result = object(value, 'quiz');
  const { total, firstAO3: first } = miniQuizCounts(level);
  const questions = array(result.questions, 'questions', total, total);
  const parsed = array(result.stimuli, 'stimuli', level === 'GCSE' ? 1 : 3, 3).map(s => parseStimulus(s, level));
  const stimuli: QuizStimulus[] = [];
  const aliases = new Map<string, string>();
  const contents = new Map<string, string>();
  const contentsById = new Map<string, string>();
  for (const stimulus of parsed) {
    const { id, ...content } = stimulus;
    // Only identical, validated content is merged, including title/context.
    // Similar-looking graphs with different claims must remain distinct.
    const signature = JSON.stringify(content);
    if (contentsById.has(id) && contentsById.get(id) !== signature) fail(`stimulus ID ${id} has conflicting evidence`);
    contentsById.set(id, signature);
    const canonical = contents.get(signature) ?? id;
    aliases.set(id, canonical);
    if (!contents.has(signature)) {
      contents.set(signature, id);
      stimuli.push(stimulus);
    }
  }
  if (level === 'A-LEVEL' && stimuli.length !== 3) fail('A-level needs 3 distinct shared stimuli');
  const types: string[] = [];
  const ids = new Set(stimuli.map(s => s.id));
  const idsByQuestion = new Map<number, string[]>();
  const allowedTypes: readonly string[] = AO3_TYPES[level];
  questions.forEach((entry, i) => {
    const q = object(entry, 'question');
    const refs = [...new Set(array(q.stimulusIds ?? [], 'stimulusIds', 0, 3).map(value => {
      const id = text(value, 'stimulusId', 30);
      return aliases.get(id) ?? id;
    }))];
    if (i + 1 < first) { if (refs.length) fail('AO1/AO2 must not reference AO3 stimuli'); return; }
    const expected = i + 1;
    text(q.text, `Q${expected}.text`, 1600);
    if (q.aoLevel !== 'AO3') fail(`Q${expected} must be AO3`);
    const marks = number(q.maxMarks, `Q${expected}.maxMarks`);
    if (!Number.isInteger(marks) || marks < 1 || marks > 8) fail(`Q${expected} needs 1-8 whole marks`);
    const missing = refs.filter(id => !ids.has(id));
    if (missing.length) fail(`Q${expected} references missing stimuli: ${missing.join(', ')}. Available IDs: ${[...ids].join(', ')}`);
    if (typeof q.requiresStimulus !== 'boolean' || q.requiresStimulus !== (refs.length > 0)) fail(`Q${expected}.requiresStimulus must match stimulusIds`);
    if (!refs.length) fail(`Q${expected} must use stimulus evidence`);
    const review = object(q.ao3Review, `Q${expected}.ao3Review`);
    types.push(choice(review.primaryType, allowedTypes, 'AO3 type'));
    text(review.evidenceUse, 'evidenceUse', 1000);
    if (!refs.length) text(review.inlineEvidence, 'inlineEvidence describing evidence supplied in question text', 1000);
    idsByQuestion.set(expected, refs);
  });
  for (const id of ids) if (![...idsByQuestion.values()].some(refs => refs.includes(id))) fail(`unused stimulus ${id}`);
  if (level === 'A-LEVEL') {
    if (new Set(types).size < 3 || types.filter(t => t === 'interpret_evidence').length > 2) fail('A-level AO3 needs at least 3 reasoning types and at most 2 interpretation questions');
    for (const id of ids) if ([...idsByQuestion.values()].filter(refs => refs.includes(id)).length !== 2) fail('Each A-level stimulus must support exactly two questions');
  }
  const entries = array(object(result.markScheme, 'markScheme').ao3, 'AO3 mark scheme', total - first + 1, total - first + 1);
  const seen = new Set<number>();
  const marksByQuestion = new Map<number, number>();
  const markScheme = entries.map(entry => {
    const m = object(entry, 'AO3 marking entry'), questionNumber = number(m.questionNumber, 'questionNumber');
    if (!Number.isInteger(questionNumber) || questionNumber < first || questionNumber > total || seen.has(questionNumber)) fail('AO3 mark scheme question numbers must match each AO3 question exactly once');
    seen.add(questionNumber);
    const markPoints = array(m.markPoints, 'markPoints', 1, 8).map(p => text(p, 'marking point', 600));
    let sum = 0;
    for (const point of markPoints) {
      const match = /\[(\d+)\]\s*$/.exec(point);
      if (!match || Number(match[1]) < 1) fail('Each AO3 marking point must end with its awarded marks, e.g. [1]');
      sum += Number(match[1]);
    }
    if (sum < 1 || sum > 8) fail(`Q${questionNumber}: AO3 marking points must total 1-8 marks`);
    // The reviewed prompt derives the total from distinct awarded points. Calculate
    // that total rather than relying on the model to repeat the arithmetic correctly.
    marksByQuestion.set(questionNumber, sum);
    return { questionNumber, markPoints, ...(m.reasoningToLearn == null ? {} : { reasoningToLearn: text(m.reasoningToLearn, 'reasoningToLearn', 400) }) };
  });
  return { stimuli, idsByQuestion, marksByQuestion, markScheme };
}
