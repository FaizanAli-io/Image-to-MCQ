import { miniQuizCounts } from './mini-quiz-config';
// Strict API schema guarantees the transport shape. Scientific plausibility,
// reference integrity, chart bounds and marks are checked separately.
import { AO3_TYPES } from './ao3-taxonomy';
type Schema = Record<string, unknown>;
const string: Schema = { type: 'string' };
const number: Schema = { type: 'number' };
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] });
const list = (items: Schema): Schema => ({ type: 'array', items });
const enumValue = (...values: string[]): Schema => ({ type: 'string', enum: values });
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const axis = object({ label: string, units: string, min: number, max: number, tickStep: number });
const trendPoint = object({ x: number, y: number });
const base = { id: string, title: string, context: nullable(string) };
// Error bars and their explanation are one contract: positive errors cannot be
// emitted with a null explanation. No-error graphs use null (or zero) errors.
const graph = { anyOf: [false, true].map(withErrors => object({
  ...base, kind: enumValue('graph'), graphType: enumValue('line', 'scatter', 'bar'),
  xAxis: axis, yAxis: axis,
  series: { ...list(object({
    name: string,
    points: { ...list(object({ x: number, y: number, yError: nullable(withErrors ? { type: 'number', minimum: 0 } : { type: 'number', enum: [0] }) })), minItems: 2, maxItems: 60 },
    trendPoints: nullable({ ...list(trendPoint), minItems: 2, maxItems: 60 }),
  })), minItems: 1, maxItems: 4 },
  categories: nullable({ ...list(string), minItems: 2, maxItems: 8 }),
  errorDescription: withErrors ? { type: 'string', minLength: 1, maxLength: 160 } : { type: 'null' },
})) };
const diagramElement: Schema = { anyOf: [
  object({ type: enumValue('rect', 'ellipse'), x: number, y: number, width: number, height: number, fill: enumValue('none', 'light', 'dark') }),
  object({ type: enumValue('line', 'arrow'), x: number, y: number, x2: number, y2: number }),
  object({ type: enumValue('label'), x: number, y: number, text: string }),
] };
const stimulus: Schema = { anyOf: [
  object({ ...base, kind: enumValue('text'), paragraphs: list(string) }),
  object({ ...base, kind: enumValue('table'), columns: list(string), rows: list(list(string)) }),
  graph,
  object({ ...base, kind: enumValue('diagram'), diagramType: enumValue('apparatus', 'geometry'), elements: list(diagramElement) }),
] };
const markingEntry = object({ questionNumber: { type: 'integer' }, markPoints: list(string) });
export const MINI_QUIZ_SCHEMA = object({
  topicName: string,
  developerSpecification: object({
    studentInstructions: { type: "string", maxLength: 300 },
    stimuli: list(object({ stimulusId: string, questionNumbers: list({ type: "integer" }), format: string, whyNecessary: { type: "string", maxLength: 400 }, whyFormat: { type: "string", maxLength: 250 } })),
    typeCheck: list(object({ questionNumber: { type: "integer" }, primaryType: string, justification: string })),
  }),
  questions: list(object({
    text: string,
    type: enumValue('SHORT_ANSWER', 'LONG_ANSWER'),
    maxMarks: { type: 'integer' },
    aoLevel: enumValue('AO1', 'AO2', 'AO3'),
    requiresStimulus: { type: 'boolean' },
    stimulusIds: { ...list(string), maxItems: 3 },
    ao3Review: nullable(object({ primaryType: string, evidenceUse: string, inlineEvidence: nullable(string) })),
  })),
  stimuli: list(stimulus),
  markScheme: object({
    ao1: list(markingEntry),
    ao2: list(markingEntry),
    ao3: list(object({ questionNumber: { type: 'integer' }, markPoints: list(string), reasoningToLearn: nullable(string) })),
  }),
});

export const AO3_REVIEW_SCHEMA = object({
  passes: { type: 'boolean' },
  issues: list(string),
});

export function getMiniQuizSchema(level: 'GCSE' | 'A-LEVEL'): Schema {
  const properties = MINI_QUIZ_SCHEMA.properties as Record<string, Schema>;
  const { total } = miniQuizCounts(level);
  const allowedStimuli = level === 'GCSE' ? stimulus : { anyOf: (stimulus.anyOf as Schema[]).slice(0, 3) };
  const question = properties.questions.items as Schema;
  const questionProperties = question.properties as Record<string, Schema>;
  return object({
    ...properties,
    questions: { ...properties.questions, minItems: total, maxItems: total, items: object({
      ...questionProperties,
      ao3Review: nullable(object({ primaryType: enumValue(...AO3_TYPES[level]), evidenceUse: string, inlineEvidence: nullable(string) })),
    }) },
    stimuli: { ...list(allowedStimuli), minItems: level === 'GCSE' ? 0 : 2, maxItems: level === 'GCSE' ? 6 : 3 },
  });
}

export function getMiniQuizSectionSchema(level: 'GCSE' | 'A-LEVEL', section: 'ao1' | 'ao2' | 'ao3'): Schema {
  const full = getMiniQuizSchema(level).properties as Record<string, Schema>;
  const count = miniQuizCounts(level)[section];
  const question = full.questions.items as Schema;
  const questionProperties = question.properties as Record<string, Schema>;
  const marking = (full.markScheme.properties as Record<string, Schema>)[section];
  return object({
    ...(section === 'ao3' ? { developerSpecification: full.developerSpecification, stimuli: full.stimuli } : {}),
    topicName: string,
    questions: { ...full.questions, minItems: count, maxItems: count, items: object({
      ...questionProperties, aoLevel: enumValue(section.toUpperCase()),
    }) },
    markScheme: { ...marking, minItems: count, maxItems: count },
  });
}
