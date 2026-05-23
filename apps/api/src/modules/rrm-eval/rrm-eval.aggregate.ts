import {
  RRM_ADAPTER_LAYER,
  RRM_SOURCE_VERSION_EVAL,
} from "../rrm-shared";
import { RRM_EVAL_AGGREGATE_SCHEMA_VERSION } from "./rrm-eval.constants";
import type {
  BuildRrmEvalAggregateParams,
  RrmEvalAggregateV1,
  RrmEvalRateMetric,
  RrmEvalSampleRecord,
} from "./rrm-eval.types";

function rateMetric(numerator: number, denominator: number): RrmEvalRateMetric {
  return {
    numerator,
    denominator,
    rate: denominator > 0 ? numerator / denominator : null,
  };
}

/**
 * Pure RRM-Eval aggregate (M5.1-r11). No per-user RFI; de-identified cohort metrics only.
 */
export function buildRrmEvalAggregate(params: BuildRrmEvalAggregateParams): RrmEvalAggregateV1 {
  const { samples, limit, sinceDays } = params;
  const generatedAt = params.generatedAt ?? new Date().toISOString();

  let withRrmSimSummary = 0;
  let withConversation = 0;
  let withFeedback = 0;
  let cautionBucketCount = 0;
  let rrmSupportedCount = 0;
  let predictedColdRiskCount = 0;

  let rrmSupportedSuccessNum = 0;
  let rrmSupportedDenom = 0;
  let cautionNegativeNum = 0;
  let cautionDenom = 0;
  let coldHitNum = 0;
  let coldHitDenom = 0;
  let assistantHelpfulNum = 0;
  let assistantHelpfulDenom = 0;

  const deltas: number[] = [];

  for (const s of samples) {
    if (s.hasRrmSimSummary) withRrmSimSummary += 1;
    if (s.hasConversation) withConversation += 1;
    if (s.hasConversationFeedback) withFeedback += 1;
    if (s.cautionBucket) cautionBucketCount += 1;
    if (s.rrmSupported) rrmSupportedCount += 1;
    if (s.predictedColdRisk) predictedColdRiskCount += 1;

    if (s.rrmSupported) {
      rrmSupportedDenom += 1;
      if (s.positiveOutcome && !s.negativeOutcome) rrmSupportedSuccessNum += 1;
    }

    if (s.cautionBucket) {
      cautionDenom += 1;
      if (s.negativeOutcome) cautionNegativeNum += 1;
    }

    if (s.predictedColdRisk) {
      coldHitDenom += 1;
      if (s.actualColdDropoff) coldHitNum += 1;
    }

    if (s.hasConversationFeedback) {
      assistantHelpfulDenom += 1;
      if (s.assistantHelpful) assistantHelpfulNum += 1;
    }

    if (s.simulatedRhythmScore != null && s.observedRhythmProxy != null) {
      deltas.push(s.observedRhythmProxy - s.simulatedRhythmScore);
    }
  }

  const meanDelta =
    deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;

  const notes = [
    "De-identified aggregate only; no raw user ids, messages, or transcripts.",
    "Outcome proxies: positive feedback / sustained chat / cold dropoff after active thread.",
    "Assistant helpful rate uses conversation feedback rows only (no impression tracking in v1).",
  ];
  if (withFeedback === 0) {
    notes.push("No conversation feedback in sample; assistantHelpfulRate denominator is 0.");
  }

  return {
    schemaVersion: RRM_EVAL_AGGREGATE_SCHEMA_VERSION,
    sourceVersion: RRM_SOURCE_VERSION_EVAL,
    layer: RRM_ADAPTER_LAYER.CONSUMER,
    mode: "consumer_readonly",
    appliedToMatchResult: false,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    sampleSize: samples.length,
    matchResultSampleSize: samples.length,
    conversationLinkedCount: withConversation,
    feedbackSampleSize: withFeedback,
    metrics: {
      rrmSupportedSuccessRate: rateMetric(rrmSupportedSuccessNum, rrmSupportedDenom),
      cautionNegativeRate: rateMetric(cautionNegativeNum, cautionDenom),
      observedVsSimDelta: {
        meanDelta,
        sampleCount: deltas.length,
      },
      assistantHelpfulRate: rateMetric(assistantHelpfulNum, assistantHelpfulDenom),
      coldRiskHitRate: rateMetric(coldHitNum, coldHitDenom),
    },
    coverage: {
      withRrmSimSummary,
      withConversation,
      withFeedback,
      cautionBucketCount,
      rrmSupportedCount,
      predictedColdRiskCount,
    },
    limit,
    sinceDays,
    generatedAt,
    notes,
  };
}

export function mergeEvalSamplesForTest(samples: RrmEvalSampleRecord[]): RrmEvalAggregateV1 {
  return buildRrmEvalAggregate({ samples, limit: samples.length, sinceDays: 30 });
}
