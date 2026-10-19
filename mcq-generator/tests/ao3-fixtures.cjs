const graph = {
  id: 'rates', title: 'Reaction measurements', kind: 'graph', graphType: 'line',
  context: 'Two treatments were tested under the same conditions. Each value is the mean of three repeats.',
  xAxis: { label: 'Time', units: 's', min: 0, max: 40, tickStep: 10 },
  yAxis: { label: 'Volume collected', units: 'cm3', min: 0, max: 50, tickStep: 10 },
  series: [
    { name: 'Treatment A', points: [{ x: 0, y: 0 }, { x: 10, y: 16, yError: 2 }, { x: 20, y: 24, yError: 3 }, { x: 30, y: 28, yError: 3 }, { x: 40, y: 30, yError: 2 }] },
    { name: 'Treatment B', points: [{ x: 0, y: 0 }, { x: 10, y: 8, yError: 2 }, { x: 20, y: 14, yError: 2 }, { x: 30, y: 18, yError: 3 }, { x: 40, y: 20, yError: 2 }] },
  ], errorDescription: 'Error bars show plus/minus one standard deviation.',
};
const table = { id: 'results', title: 'Repeated measurements', kind: 'table', columns: ['Condition', 'Trial 1 (cm3)', 'Trial 2 (cm3)', 'Trial 3 (cm3)'], rows: [['A', '28', '30', '32'], ['B', '18', '20', '22']], context: 'A student claims that every individual measurement in condition A must exceed every measurement in condition B in future repeats.' };
const written = { id: 'method', title: 'Sampling method', kind: 'text', paragraphs: ['A student samples three equally sized areas near a path, all on the same morning. They use these observations to make a claim about the entire field.', 'The field also contains shaded and unshaded areas further from the path.'] };
const diagram = { id: 'setup', title: 'Containers used in an investigation', kind: 'diagram', diagramType: 'apparatus', elements: [
  { type: 'rect', x: 80, y: 90, width: 120, height: 160, fill: 'none' },
  { type: 'rect', x: 360, y: 90, width: 120, height: 160, fill: 'none' },
  { type: 'rect', x: 80, y: 170, width: 120, height: 80, fill: 'light' },
  { type: 'rect', x: 360, y: 130, width: 120, height: 120, fill: 'light' },
  { type: 'label', x: 80, y: 60, text: 'Container A' }, { type: 'label', x: 360, y: 60, text: 'Container B' },
] };
function fixture(level = 'A-LEVEL') {
  const ao1 = level === 'GCSE' ? 10 : 8, ao2 = 6, total = level === 'GCSE' ? 19 : 20;
  const markScheme = { ao1: [], ao2: [], ao3: [] };
  const questions = Array.from({ length: total }, (_, i) => {
    const aoLevel = i < ao1 ? 'AO1' : i < ao1 + ao2 ? 'AO2' : 'AO3';
    const n = i - ao1 - ao2;
    const question = { text: `${aoLevel === 'AO3' ? 'Use the supplied evidence to assess the stated comparison' : 'Question about the revised content'} (${i + 1}).`, type: 'SHORT_ANSWER', aoLevel, maxMarks: 2 };
    if (aoLevel === 'AO3') Object.assign(question, { requiresStimulus: true, stimulusIds: [['rates'], ['results'], ['method']][level === 'GCSE' ? n : Math.floor(n / 2)], ao3Review: { primaryType: (level === 'GCSE' ? ['interpret_evidence','explain_evidence','judge_claim'] : ['interpret_evidence','explain_evidence','draw_conclusion','evaluate_claim','evaluate_method','alternative_explanations'])[n], evidenceUse: 'PRIVATE REVIEW NOTE: compare the actual supplied measurements.' } });
    markScheme[aoLevel.toLowerCase()].push({ questionNumber: i + 1, markPoints: ['First distinct evidence point [1]', 'Second distinct evidence point [1]'], ...(aoLevel === 'AO3' ? { reasoningToLearn: 'Support the comparison with specific evidence.' } : {}) });
    return question;
  });
  return structuredClone({ topicName: 'AO3 rendering checks', questions, stimuli: [graph, table, written], markScheme });
}
function studentQuestions(raw) {
  return raw.questions.map((q, i) => ({ text: q.text, type: q.type, maxMarks: q.maxMarks, aoLevel: q.aoLevel, questionNumber: i + 1, topic: raw.topicName, markScheme: raw.markScheme, ...(q.aoLevel === 'AO3' ? { stimuli: q.stimulusIds.map(id => raw.stimuli.find(s => s.id === id)) } : {}) }));
}
function sectionFixture(raw, section) {
  const questions = raw.questions.filter(q => q.aoLevel.toLowerCase() === section);
  const offset = raw.questions.indexOf(questions[0]);
  return { topicName: raw.topicName, questions,
    markScheme: raw.markScheme[section].map(m => ({ ...m, questionNumber: m.questionNumber - offset })),
    ...(section === 'ao3' ? { stimuli: raw.stimuli } : {}) };
}
module.exports = { sectionFixture, fixture, graph, table, written, diagram, studentQuestions };
