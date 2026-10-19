import { miniQuizCounts } from './mini-quiz-config';
// Strict API schema guarantees the transport shape. Scientific plausibility,
// reference integrity, chart bounds and marks are checked separately.
import { AO3_TYPES } from './ao3-taxonomy';
type Schema = Record<string, unknown>;
const string: Schema = { type: 'string' };
const text = (maxLength: number): Schema => ({ type: 'string', minLength: 1, maxLength });
const number: Schema = { type: 'number' };
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] });
const list = (items: Schema): Schema => ({ type: 'array', items });
const enumValue = (...values: string[]): Schema => ({ type: 'string', enum: values });
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const axis = object({ label: text(70), units: { type: 'string', maxLength: 30 }, min: number, max: number, tickStep: number });
const trendPoint = object({ x: number, y: number });
const base = { id: { ...text(30), pattern: '^[a-zA-Z0-9_-]+$' }, title: text(100), context: nullable(text(1000)) };
// Error bars and their explanation are one contract: positive errors cannot be
// emitted with a null explanation. No-error graphs use null (or zero) errors.
const graph = { anyOf: ['line', 'scatter', 'bar'].flatMap(graphType => [false, true].map(withErrors => object({
  ...base, kind: enumValue('graph'), graphType: enumValue(graphType),
  xAxis: axis, yAxis: axis,
  series: { ...list(object({
    name: text(65),
    points: { ...list(object({ x: number, y: number, yError: nullable(withErrors ? { type: 'number', minimum: 0 } : { type: 'number', enum: [0] }) })), minItems: 2, maxItems: 60 },
    trendPoints: graphType === 'scatter' ? nullable({ ...list(trendPoint), minItems: 2, maxItems: 60 }) : { type: 'null' },
  })), minItems: 1, maxItems: 4 },
  categories: graphType === 'bar' ? { ...list(text(45)), minItems: 2, maxItems: 8 } : { type: 'null' },
  errorDescription: withErrors ? { type: 'string', minLength: 1, maxLength: 160 } : { type: 'null' },
}))) };
const diagramElement: Schema = { anyOf: [
  object({ type: enumValue('rect', 'ellipse'), x: number, y: number, width: number, height: number, fill: enumValue('none', 'light', 'dark') }),
  object({ type: enumValue('line', 'arrow'), x: number, y: number, x2: number, y2: number }),
  object({ type: enumValue('label'), x: number, y: number, text: string }),
] };
const stimulus: Schema = { anyOf: [
  object({ ...base, kind: enumValue('text'), paragraphs: { ...list(text(1000)), minItems: 1, maxItems: 8 } }),
  object({ ...base, kind: enumValue('table'), columns: { ...list(text(90)), minItems: 2, maxItems: 5 }, rows: { ...list({ ...list(text(160)), minItems: 2, maxItems: 5 }), minItems: 1, maxItems: 16 } }),
  graph,
  object({ ...base, kind: enumValue('diagram'), diagramType: enumValue('apparatus', 'geometry'), elements: list(diagramElement) }),
] };
const responseGroups = list(list({ type: 'integer', minimum: 1, maximum: 8 }));
const markPoints = { ...list({ ...text(600), pattern: '\\S.*\\[1\\]\\s*$' }), minItems: 1, maxItems: 8 };
const markingEntry = object({ questionNumber: { type: 'integer' }, markPoints, responseGroups });
export const MINI_QUIZ_SCHEMA = object({
  topicName: string,
  developerSpecification: object({
    studentInstructions: { type: "string", maxLength: 300 },
    stimuli: list(object({ stimulusId: string, questionNumbers: list({ type: "integer" }), format: string, whyNecessary: { type: "string", maxLength: 400 }, whyFormat: { type: "string", maxLength: 250 } })),
    typeCheck: list(object({ questionNumber: { type: "integer" }, primaryType: string, justification: string })),
  }),
  questions: list(object({
    text: text(1600),
    type: enumValue('SHORT_ANSWER', 'LONG_ANSWER'),
    maxMarks: { type: 'integer', minimum: 1, maximum: 8 },
    requestedResponses: nullable({ type: 'integer', minimum: 1, maximum: 8 }),
    aoLevel: enumValue('AO1', 'AO2', 'AO3'),
    requiresStimulus: { type: 'boolean' },
    stimulusIds: { ...list(string), maxItems: 3 },
    ao3Review: nullable(object({ primaryType: string, evidenceUse: string, inlineEvidence: nullable(string) })),
  })),
  stimuli: list(stimulus),
  markScheme: object({
    ao1: list(markingEntry),
    ao2: list(markingEntry),
    ao3: list(object({ questionNumber: { type: 'integer' }, markPoints, responseGroups, reasoningToLearn: nullable(text(400)) })),
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
      ao3Review: nullable(object({ primaryType: enumValue(...AO3_TYPES[level]), evidenceUse: text(1000), inlineEvidence: nullable(text(1000)) })),
    }) },
    stimuli: { ...list(allowedStimuli), minItems: level === 'GCSE' ? 1 : 3, maxItems: level === 'GCSE' ? 3 : 3 },
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
      ...(section === 'ao3' ? {
        requiresStimulus: { type: 'boolean', enum: [true] },
        stimulusIds: { ...list(string), minItems: 1, maxItems: 3 },
        ao3Review: (questionProperties.ao3Review.anyOf as Schema[])[0],
      } : {
        requiresStimulus: { type: 'boolean', enum: [false] },
        stimulusIds: { ...list(string), maxItems: 0 },
        ao3Review: { type: 'null' },
      }),
    }) },
    markScheme: { ...marking, minItems: count, maxItems: count },
  });
}
