import type { RrmSourceVersion } from "../rrm-shared";
import { RRM_SOURCE_VERSION_EVAL } from "../rrm-shared";

export type RrmEvalRateMetric = {
  rate: number | null;
  numerator: number;
  denominator: number;
};

export type RrmEvalObservedVsSimDeltaMetric = {
  meanDelta: number | null;
  sampleCount: number;
};

/** Internal per-row inputs — never returned on HTTP (de-identified aggregate only). */
export type RrmEvalSampleRecord = {
  hasConversation: boolean;
  hasRrmSimSummary: boolean;
  rrmSupported: boolean;
  cautionBucket: boolean;
  negativeOutcome: boolean;
  positiveOutcome: boolean;
  simulatedRhythmScore: number | null;
  observedRhythmProxy: number | null;
  predictedColdRisk: boolean;
  actualColdDropoff: boolean;
  hasConversationFeedback: boolean;
  assistantHelpful: boolean;
};

export type RrmEvalAggregateV1 = {
  schemaVersion: 1;
  sourceVersion: typeof RRM_SOURCE_VERSION_EVAL;
  layer: "consumer";
  mode: "consumer_readonly";
  appliedToMatchResult: false;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  sampleSize: number;
  matchResultSampleSize: number;
  conversationLinkedCount: number;
  feedbackSampleSize: number;
  metrics: {
    rrmSupportedSuccessRate: RrmEvalRateMetric;
    cautionNegativeRate: RrmEvalRateMetric;
    observedVsSimDelta: RrmEvalObservedVsSimDeltaMetric;
    assistantHelpfulRate: RrmEvalRateMetric;
    coldRiskHitRate: RrmEvalRateMetric;
  };
  coverage: {
    withRrmSimSummary: number;
    withConversation: number;
    withFeedback: number;
    cautionBucketCount: number;
    rrmSupportedCount: number;
    predictedColdRiskCount: number;
  };
  limit: number;
  sinceDays: number;
  generatedAt: string;
  notes: string[];
};

export type BuildRrmEvalAggregateParams = {
  samples: RrmEvalSampleRecord[];
  limit: number;
  sinceDays: number;
  generatedAt?: string;
};
