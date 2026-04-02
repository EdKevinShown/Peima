import type { RelationDimension } from "./data/questions";
import { getQuestionOrNull, QUESTIONS } from "./data/questions";

export type AnswerInput = { questionKey: string; answerValue: string };

export type ScoredRelationProfile = Record<RelationDimension, number> & {
  confidence: number;
};

const DIMENSIONS: RelationDimension[] = [
  "socialEnergy",
  "emotionalExpression",
  "relationshipPace",
  "initiativeLevel",
  "decisionOrientation",
  "conflictResponse",
];

export function scoreQuestionnaire(
  answers: ReadonlyArray<AnswerInput>,
): ScoredRelationProfile {
  const dimScores: Record<RelationDimension, number[]> = {
    socialEnergy: [],
    emotionalExpression: [],
    relationshipPace: [],
    initiativeLevel: [],
    decisionOrientation: [],
    conflictResponse: [],
  };

  for (const row of answers) {
    const q = getQuestionOrNull(row.questionKey);
    if (!q) continue;
    const opt = q.options.find((o) => o.value === row.answerValue);
    if (!opt) continue;
    dimScores[q.dimension].push(opt.score);
  }

  const out = {} as ScoredRelationProfile;
  for (const d of DIMENSIONS) {
    const arr = dimScores[d];
    out[d] = arr.length
      ? arr.reduce((s, x) => s + x, 0) / arr.length / 100
      : 0;
  }

  const completeness = Math.min(1, answers.length / QUESTIONS.length);
  out.confidence = Math.min(1, 0.45 + completeness * 0.35);

  return out;
}
