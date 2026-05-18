/**
 * P7.6-r6a: End-to-end funnel old-new comparison (pure; no Prisma / env).
 */

import type {
  P76DifferenceStage,
  P76DifferenceStageInputV1,
  P76LegacyComparisonInputV1,
  P76Stage2TwentyDSummaryV1,
  P76Stage3RrmSummaryV1,
} from "./p76-end-to-end-funnel-shadow.types";

function normalizeId(id: string | null | undefined): string | null {
  const v = String(id ?? "").trim();
  return v.length > 0 ? v : null;
}

function normalizeIdSet(ids: string[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const id of ids ?? []) {
    const v = normalizeId(id);
    if (v) out.add(v);
  }
  return out;
}

export function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

export function computeWouldChange20DWinner(
  stage2: Pick<P76Stage2TwentyDSummaryV1, "selectedBy20DOnlyCandidateId">,
  stage3: Pick<P76Stage3RrmSummaryV1, "selectedByRrmCandidateId">,
): boolean {
  const selectedByRrm = normalizeId(stage3.selectedByRrmCandidateId);
  const selectedBy20D = normalizeId(stage2.selectedBy20DOnlyCandidateId);
  return (
    selectedByRrm != null &&
    selectedBy20D != null &&
    selectedByRrm !== selectedBy20D
  );
}

export function computeWouldChangeLegacyMatchResult(
  finalSelectedId: string | null,
  legacyMatchResultCandidateId: string | null,
): boolean {
  const finalId = normalizeId(finalSelectedId);
  const legacyId = normalizeId(legacyMatchResultCandidateId);
  return (
    finalId != null && legacyId != null && finalId !== legacyId
  );
}

export function computeWouldChangeDisplayCandidate(
  finalSelectedId: string | null,
  displayCandidateUserId: string | null,
): boolean {
  const finalId = normalizeId(finalSelectedId);
  const displayId = normalizeId(displayCandidateUserId);
  return finalId != null && displayId != null && finalId !== displayId;
}

export function computeWouldChangeWorkerWinner(
  finalSelectedId: string | null,
  workerWinnerCandidateUserId: string | null,
): boolean {
  const finalId = normalizeId(finalSelectedId);
  const workerId = normalizeId(workerWinnerCandidateUserId);
  return finalId != null && workerId != null && finalId !== workerId;
}

export function computeWouldChangeM6Top2(
  stage2Top2CandidateIds: string[],
  m6Top2CandidateIds: string[],
  stage3SelectedId: string | null,
  m6SelectedCandidateId: string | null,
): boolean {
  const stage2Set = normalizeIdSet(stage2Top2CandidateIds);
  const m6Set = normalizeIdSet(m6Top2CandidateIds);
  if (stage2Set.size > 0 || m6Set.size > 0) {
    if (!setsEqual(stage2Set, m6Set)) return true;
  }
  const finalId = normalizeId(stage3SelectedId);
  const m6Selected = normalizeId(m6SelectedCandidateId);
  return (
    finalId != null && m6Selected != null && finalId !== m6Selected
  );
}

export function hasLegacyComparisonContext(
  legacy: P76LegacyComparisonInputV1 | undefined,
): boolean {
  if (!legacy) return false;
  if (normalizeId(legacy.matchResultCandidateUserId) != null) return true;
  if (normalizeId(legacy.displayCandidateUserId) != null) return true;
  if (normalizeId(legacy.workerWinnerCandidateUserId) != null) return true;
  if (normalizeId(legacy.m6RrmSelectedCandidateId) != null) return true;
  if ((legacy.m6RrmTop2CandidateIds?.length ?? 0) > 0) return true;
  if ((legacy.legacyPreviewPoolCandidateIds?.length ?? 0) > 0) {
    return true;
  }
  return false;
}

export function stage1DiffersFromLegacyPreviewPool(
  stage1SelectedCandidateIds: string[],
  legacyPreviewPoolCandidateIds: string[],
): boolean {
  const stage1Set = normalizeIdSet(stage1SelectedCandidateIds);
  const legacySet = normalizeIdSet(legacyPreviewPoolCandidateIds);
  if (legacySet.size === 0) return false;
  return !setsEqual(stage1Set, legacySet);
}

export function computeDifferenceStage(
  input: P76DifferenceStageInputV1,
): P76DifferenceStage {
  if (normalizeId(input.finalSelectedCandidateId) == null) {
    return "unknown";
  }

  if (!input.hasLegacyContext) {
    return "unknown";
  }

  if (input.wouldChange20DWinner) {
    return "rrm_selector";
  }

  if (input.wouldChangeLegacyMatchResult && !input.wouldChange20DWinner) {
    const finalId = normalizeId(input.finalSelectedCandidateId)!;
    const workerId = normalizeId(input.workerWinnerCandidateUserId);
    const top2Set = normalizeIdSet(input.stage2Top2CandidateIds);
    if (
      workerId != null &&
      top2Set.has(workerId) &&
      workerId !== finalId
    ) {
      return "twenty_d_ranking";
    }
    return "legacy_mismatch";
  }

  if (
    stage1DiffersFromLegacyPreviewPool(
      input.stage1SelectedCandidateIds,
      input.legacyPreviewPoolCandidateIds,
    )
  ) {
    return "photo_pool";
  }

  return "no_change";
}

export function buildComparisonReasonSummary(params: {
  finalSelectedCandidateId: string | null;
  stage3Missing: boolean;
  hasLegacyContext: boolean;
  wouldChange20DWinner: boolean;
  wouldChangeLegacyMatchResult: boolean;
  wouldChangeDisplayCandidate: boolean;
  wouldChangeWorkerWinner: boolean;
  wouldChangeM6Top2: boolean;
  differenceStage: P76DifferenceStage;
}): string {
  const parts: string[] = [];
  if (params.stage3Missing) parts.push("stage3_missing");
  if (!params.hasLegacyContext) parts.push("legacy_missing");
  if (normalizeId(params.finalSelectedCandidateId) == null) {
    parts.push("final_selected_missing");
  }
  if (params.wouldChange20DWinner) parts.push("rrm_differs_from_20d");
  if (params.wouldChangeLegacyMatchResult) {
    parts.push("differs_from_match_result");
  }
  if (params.wouldChangeDisplayCandidate) {
    parts.push("differs_from_display");
  }
  if (params.wouldChangeWorkerWinner) parts.push("differs_from_worker");
  if (params.wouldChangeM6Top2) parts.push("differs_from_m6_top2");
  parts.push(`difference_stage=${params.differenceStage}`);
  if (parts.length === 1) {
    return "end_to_end_funnel_no_material_difference";
  }
  return parts.join(";");
}
