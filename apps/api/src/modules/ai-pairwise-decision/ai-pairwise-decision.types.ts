import type { ProgressionWindowValue, SuggestedActionValue } from "./ai-pairwise-decision.schema";

/** 20 维摘要：桶化后的键值，不含原始问卷全文。 */
export type AxisScoresSummary = Record<string, number>;

export type RelationshipShortlistTop2Candidate = {
  candidateUserId: string;
  staticRank: 1 | 2;
  /** 0–100（M3.8-M0 冻结）。 */
  staticCompatibilityScore: number;
  axisScoresSummary: AxisScoresSummary;
  majorStrengths: string[];
  majorRisks: string[];
  dealbreakerPassed: true;
  visualPoolRank?: number;
  reasonSummary: string;
};

export type RelationshipShortlistTop2 = {
  schemaVersion: 1;
  sourceVersion: "relationship-shortlist-top2-v1";
  viewerUserId: string;
  poolId: string;
  shortlistFingerprint?: string;
  candidates: [RelationshipShortlistTop2Candidate, RelationshipShortlistTop2Candidate];
  generatedAt: string;
};

export type AiPairwiseDecisionCandidateBlock = {
  conversationFit: number;
  emotionalSafety: number;
  conflictRepair: number;
  progressionFit: number;
  longTermFit: number;
  riskControl: number;
  strongRisk: boolean;
  suggestedAction: SuggestedActionValue;
  progressionWindow: ProgressionWindowValue;
  reasonSummary: string;
};

export type AiPairwiseDecisionDimensions = {
  conversationFit: number;
  emotionalSafety: number;
  conflictRepair: number;
  progressionFit: number;
  longTermFit: number;
  riskControl: number;
};

export type AiPairwiseDecision = {
  schemaVersion: 1;
  sourceVersion: "rrm-lite-pairwise-decision-v1";
  viewerUserId: string;
  poolId: string;
  candidateAUserId: string;
  candidateBUserId: string;
  winnerCandidateId: string;
  loserCandidateId: string;
  /** 0–1 */
  decisionConfidence: number;
  /** 0–100 */
  decisionScoreA: number;
  /** 0–100 */
  decisionScoreB: number;
  dimensions: AiPairwiseDecisionDimensions;
  candidateA: AiPairwiseDecisionCandidateBlock;
  candidateB: AiPairwiseDecisionCandidateBlock;
  decisionReason: string;
  fallbackUsed: boolean;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  generatedAt: string;
};

export type AiPairwiseDecisionSchemaFailureDetail = {
  path: string;
  reason: string;
  expected?: string;
  actual?: string;
};

export type ParseValidateRelationshipShortlistTop2Result =
  | { ok: true; value: RelationshipShortlistTop2 }
  | { ok: false; failureDetail: AiPairwiseDecisionSchemaFailureDetail };

export type ParseValidateAiPairwiseDecisionResult =
  | { ok: true; value: AiPairwiseDecision }
  | { ok: false; failureDetail: AiPairwiseDecisionSchemaFailureDetail };
