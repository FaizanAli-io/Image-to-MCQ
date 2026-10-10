// Shared by the output schema and runtime validation so the two cannot drift.
export const AO3_TYPES = {
  GCSE: ['interpret_evidence', 'explain_evidence', 'predict_infer', 'evaluate_investigation', 'judge_claim'],
  'A-LEVEL': ['interpret_evidence', 'explain_evidence', 'draw_conclusion', 'evaluate_claim', 'evaluate_method', 'alternative_explanations'],
} as const;
