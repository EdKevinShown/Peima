/**
 * P7.6-r6a: build P76EndToEndFunnelShadowAuditV1 (pure; no Prisma / env / DB).
 */

import {
  buildComparisonReasonSummary,
  computeDifferenceStage,
  computeWouldChange20DWinner,
  computeWouldChangeDisplayCandidate,
  computeWouldChangeLegacyMatchResult,
  computeWouldChangeM6Top2,
  computeWouldChangeWorkerWinner,
  hasLegacyComparisonContext,
} from "./p76-end-to-end-funnel-comparison";
import {
  END_TO_END_FUNNEL_SHADOW_SCHEMA_VERSION,
  END_TO_END_FUNNEL_SHADOW_SOURCE_VERSION,
  type P76EndToEndFunnelInputV1,
  type P76EndToEndFunnelShadowAuditV1,
  type P76FinalShadowV1,
  type P76LegacyComparisonInputV1,
  type P76LegacyComparisonV1,
} from "./p76-end-to-end-funnel-shadow.types";

const R6A_SOURCE_POOL_TYPE = "onboarding_gated_cohort" as const;

function normalizeId(id: string | null | undefined): string | null {
  const v = String(id ?? "").trim();
  return v.length > 0 ? v : null;
}

function assertR6aSourcePoolType(
  sourcePoolType: P76EndToEndFunnelInputV1["sourcePoolType"],
): void {
  if (sourcePoolType !== R6A_SOURCE_POOL_TYPE) {
    throw new Error(
      `P7.6-r6a builder only supports sourcePoolType=${R6A_SOURCE_POOL_TYPE}, got ${sourcePoolType}`,
    );
  }
}

function resolveFinalSelectedCandidateId(
  input: P76EndToEndFunnelInputV1,
): { finalId: string | null; stage3Missing: boolean } {
  const fromStage3 = normalizeId(input.stage3Rrm.selectedByRrmCandidateId);
  if (fromStage3 != null) {
    return { finalId: fromStage3, stage3Missing: false };
  }
  const fromStage2 = normalizeId(
    input.stage2TwentyD.selectedBy20DOnlyCandidateId,
  );
  return {
    finalId: fromStage2,
    stage3Missing: true,
  };
}

function normalizeLegacyInput(
  legacy: P76LegacyComparisonInputV1 | undefined,
): Required<
  Pick<
    P76LegacyComparisonV1,
    | "matchResultCandidateUserId"
    | "matchResultFinalScore"
    | "displayCandidateUserId"
    | "displaySourceType"
    | "legacyPreviewPoolCandidateIds"
    | "workerWinnerCandidateUserId"
    | "m6RrmTop2CandidateIds"
    | "m6RrmSelectedCandidateId"
  >
> & { matchResultId?: string | null } {
  return {
    matchResultId: legacy?.matchResultId ?? null,
    matchResultCandidateUserId:
      normalizeId(legacy?.matchResultCandidateUserId) ?? null,
    matchResultFinalScore:
      legacy?.matchResultFinalScore != null &&
      Number.isFinite(legacy.matchResultFinalScore)
        ? legacy.matchResultFinalScore
        : null,
    displayCandidateUserId: normalizeId(legacy?.displayCandidateUserId) ?? null,
    displaySourceType: normalizeId(legacy?.displaySourceType) ?? null,
    legacyPreviewPoolCandidateIds: (legacy?.legacyPreviewPoolCandidateIds ??
      [])
      .map((id) => normalizeId(id))
      .filter((id): id is string => id != null),
    workerWinnerCandidateUserId:
      normalizeId(legacy?.workerWinnerCandidateUserId) ?? null,
    m6RrmTop2CandidateIds: (legacy?.m6RrmTop2CandidateIds ?? [])
      .map((id) => normalizeId(id))
      .filter((id): id is string => id != null),
    m6RrmSelectedCandidateId:
      normalizeId(legacy?.m6RrmSelectedCandidateId) ?? null,
  };
}

function buildFinalShadow(finalId: string | null): P76FinalShadowV1 {
  return {
    selectedCandidateId: finalId,
    applied: false,
    appliedToPool: false,
    appliedToFinalScore: false,
    appliedToMatchResult: false,
    appliedToWorkerRanking: false,
    appliedToDisplay: false,
  };
}

export function buildP76EndToEndFunnelShadowAuditV1(
  input: P76EndToEndFunnelInputV1,
): P76EndToEndFunnelShadowAuditV1 {
  assertR6aSourcePoolType(input.sourcePoolType);

  const { finalId, stage3Missing } = resolveFinalSelectedCandidateId(input);
  const legacyNorm = normalizeLegacyInput(input.legacy);
  const hasLegacyContext = hasLegacyComparisonContext(input.legacy);

  const wouldChange20DWinner = computeWouldChange20DWinner(
    input.stage2TwentyD,
    input.stage3Rrm,
  );

  const wouldChangeLegacyMatchResult = computeWouldChangeLegacyMatchResult(
    finalId,
    legacyNorm.matchResultCandidateUserId,
  );
  const wouldChangeDisplayCandidate = computeWouldChangeDisplayCandidate(
    finalId,
    legacyNorm.displayCandidateUserId,
  );
  const wouldChangeWorkerWinner = computeWouldChangeWorkerWinner(
    finalId,
    legacyNorm.workerWinnerCandidateUserId,
  );
  const wouldChangeM6Top2 = computeWouldChangeM6Top2(
    input.stage2TwentyD.top2CandidateIds,
    legacyNorm.m6RrmTop2CandidateIds,
    input.stage3Rrm.selectedByRrmCandidateId,
    legacyNorm.m6RrmSelectedCandidateId,
  );

  const differenceStage = computeDifferenceStage({
    finalSelectedCandidateId: finalId,
    wouldChange20DWinner,
    wouldChangeLegacyMatchResult,
    wouldChangeWorkerWinner,
    wouldChangeDisplayCandidate,
    stage1SelectedCandidateIds: input.stage1PhotoVisual.selectedCandidateIds,
    legacyPreviewPoolCandidateIds:
      legacyNorm.legacyPreviewPoolCandidateIds,
    stage2Top2CandidateIds: input.stage2TwentyD.top2CandidateIds,
    workerWinnerCandidateUserId: legacyNorm.workerWinnerCandidateUserId,
    hasLegacyContext,
  });

  const comparisonReasonSummary = buildComparisonReasonSummary({
    finalSelectedCandidateId: finalId,
    stage3Missing,
    hasLegacyContext,
    wouldChange20DWinner,
    wouldChangeLegacyMatchResult,
    wouldChangeDisplayCandidate,
    wouldChangeWorkerWinner,
    wouldChangeM6Top2,
    differenceStage,
  });

  const legacyComparison: P76LegacyComparisonV1 = {
    ...legacyNorm,
    wouldChangeLegacyMatchResult,
    wouldChangeDisplayCandidate,
    wouldChangeWorkerWinner,
    wouldChangeM6Top2,
    differenceStage,
    comparisonReasonSummary,
  };

  const selectedCount = input.stage1PhotoVisual.selectedCandidateIds.length;

  return {
    schemaVersion: END_TO_END_FUNNEL_SHADOW_SCHEMA_VERSION,
    sourceVersion: END_TO_END_FUNNEL_SHADOW_SOURCE_VERSION,
    viewerUserId: input.viewerUserId,
    sourcePoolType: input.sourcePoolType,
    generatedAt: input.generatedAt,
    stage1PhotoVisual: {
      ...input.stage1PhotoVisual,
      selectedCount,
    },
    stage2TwentyD: input.stage2TwentyD,
    stage3Rrm: {
      ...input.stage3Rrm,
      wouldChange20DWinner,
    },
    legacyComparison,
    finalShadow: buildFinalShadow(finalId),
  };
}
