import { MATCHING_OBSERVABILITY_SOURCE_VERSION } from "@peima/database";
import type { MatchingObservabilitySummaryReport } from "@peima/database";

/** Top-level keys every consumer (CLI, Admin API) must expose. */
export const MATCHING_OBSERVABILITY_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "sourceVersion",
  "generatedAt",
  "window",
  "notes",
  "pairwise",
  "simulation",
  "finalizeMeta",
  "matchAndPreview",
  "m42AlignmentHint",
] as const;

export const MATCHING_OBSERVABILITY_PAIRWISE_KEYS = [
  "totalInWindow",
  "statusDistribution",
  "sourceVersionDistribution",
  "fallbackUsed",
  "failureDetailCodeDistribution",
  "schemaValidationCount",
] as const;

export const MATCHING_OBSERVABILITY_SIMULATION_KEYS = [
  "jobStatusDistributionInWindow",
  "itemStatusDistributionInWindow",
  "itemErrorCodeDistributionInWindow",
  "failedItemCountInWindow",
  "schemaValidationItemCountInWindow",
] as const;

export const MATCHING_OBSERVABILITY_FINALIZE_KEYS = [
  "totalInWindow",
  "totalAllTime",
  "frozenTrueInWindow",
  "frozenTrueAllTime",
  "metaStatsSampled",
  "metaRowsParsed",
  "wouldChangeStaticResult",
  "fallbackReasonDistribution",
  "pairwiseProposalRecommendationDistribution",
  "appliedToFinalScoreTrueCountAmongParsed",
  "appliedToWorkerRankingTrueCountAmongParsed",
  "appliedFlagsDenominatorRows",
  "metaParseErrorCount",
  "metaParseErrorBuckets",
] as const;

export const MATCHING_OBSERVABILITY_MATCH_PREVIEW_KEYS = [
  "matchResultsTotal",
  "previewPoolsTotal",
  "previewPoolsWithFinalizeMetaRow",
  "distinctPreviewPoolsWithSucceededSimulationInWindow",
] as const;

/** Keys that must never appear anywhere in the serialized report (privacy / scope). */
export const MATCHING_OBSERVABILITY_FORBIDDEN_KEY_NAMES = new Set([
  "userId",
  "viewerUserId",
  "candidateUserId",
  "poolId",
  "jobId",
  "simulationJobId",
  "prompt",
  "transcript",
  "rawMeta",
]);

function collectObjectKeys(value: unknown, keys: Set<string>): void {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    keys.add(k);
    collectObjectKeys(v, keys);
  }
}

export function findForbiddenKeysInReport(report: unknown): string[] {
  const keys = new Set<string>();
  collectObjectKeys(report, keys);
  return [...keys].filter((k) => MATCHING_OBSERVABILITY_FORBIDDEN_KEY_NAMES.has(k));
}

export function assertMatchingObservabilityReportContract(
  report: MatchingObservabilitySummaryReport,
): void {
  for (const k of MATCHING_OBSERVABILITY_TOP_LEVEL_KEYS) {
    expect(report).toHaveProperty(k);
  }
  expect(report.schemaVersion).toBe(1);
  expect(report.sourceVersion).toBe(MATCHING_OBSERVABILITY_SOURCE_VERSION);
  expect(report.window).toMatchObject({
    sinceDays: expect.any(Number),
    sinceUtc: expect.any(String),
    rowCapForMetaParse: expect.any(Number),
  });

  for (const k of MATCHING_OBSERVABILITY_PAIRWISE_KEYS) {
    expect(report.pairwise).toHaveProperty(k);
  }
  for (const k of MATCHING_OBSERVABILITY_SIMULATION_KEYS) {
    expect(report.simulation).toHaveProperty(k);
  }
  for (const k of MATCHING_OBSERVABILITY_FINALIZE_KEYS) {
    expect(report.finalizeMeta).toHaveProperty(k);
  }
  for (const k of MATCHING_OBSERVABILITY_MATCH_PREVIEW_KEYS) {
    expect(report.matchAndPreview).toHaveProperty(k);
  }

  expect(report.m42AlignmentHint.message).toEqual(expect.any(String));
  expect(report.m42AlignmentHint.suggestedScript).toContain("m4-2-batch-regression-report");
  expect(
    report.m42AlignmentHint.sanitizedRunRecordPath === null ||
      typeof report.m42AlignmentHint.sanitizedRunRecordPath === "string",
  ).toBe(true);

  const forbidden = findForbiddenKeysInReport(report);
  expect(forbidden).toEqual([]);
}
