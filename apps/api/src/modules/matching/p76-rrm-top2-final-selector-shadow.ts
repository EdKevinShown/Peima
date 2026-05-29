/**
 * P7.6-r5a: build RrmTop2FinalSelectorShadowV1 (pure; no Prisma / env / DB).
 */

import {
  computeAtoBRrmFit,
  computeBtoARrmFit,
  computeMutualRrmFit,
  computeRepairPotentialScore,
  computeRrmRiskFlagCount,
  normalizeRepairSignals,
  normalizeRiskFlags,
  sortKeysFullyTied,
  sortRrmTop2Candidates,
} from "./p76-rrm-top2-final-selector-scoring";
import {
  RRM_TOP2_FINAL_SELECTOR_SCHEMA_VERSION,
  RRM_TOP2_FINAL_SELECTOR_SOURCE_VERSION,
  type RrmCandidateSortRowV1,
  type RrmFallbackReason,
  type RrmTop2CandidateInputV1,
  type RrmTop2FinalSelectorInputV1,
  type RrmTop2FinalSelectorShadowV1,
  type RrmTop2RankedCandidateV1,
} from "./p76-rrm-top2-final-selector.types";

const R5A_SOURCE_POOL_TYPE = "onboarding_gated_cohort" as const;
const MAX_TOP2 = 2;

function assertR5aSourcePoolType(
  sourcePoolType: RrmTop2FinalSelectorInputV1["sourcePoolType"],
): void {
  if (sourcePoolType !== R5A_SOURCE_POOL_TYPE) {
    throw new Error(
      `P7.6-r5a builder only supports sourcePoolType=${R5A_SOURCE_POOL_TYPE}, got ${sourcePoolType}`,
    );
  }
}

function dedupeTop2Ids(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const v = String(id ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= MAX_TOP2) break;
  }
  return out;
}

function hasInvalidRhythmScore(...scores: Array<number | null>): boolean {
  for (const s of scores) {
    if (s !== null && !Number.isFinite(s)) return true;
  }
  return false;
}

function buildMissingSignals(candidate: RrmTop2CandidateInputV1): string[] {
  const signals: string[] = [];
  if (candidate.rhythmScoreAtoB === null) {
    signals.push("rhythm_a_to_b_missing");
  }
  if (candidate.rhythmScoreBtoA === null) {
    signals.push("rhythm_b_to_a_missing");
  }
  return signals;
}

function evaluateCandidate(
  candidate: RrmTop2CandidateInputV1,
  viewerRrmProfilePresent: boolean,
): RrmTop2RankedCandidateV1 {
  const rhythmRiskFlags = normalizeRiskFlags(candidate.rhythmRiskFlags);
  const pressureRiskFlags = normalizeRiskFlags(candidate.pressureRiskFlags);
  const boundaryRiskFlags = normalizeRiskFlags(candidate.boundaryRiskFlags);
  const repairPotentialSignals = normalizeRepairSignals(
    candidate.repairPotentialSignals,
  );
  const repairPotentialScore = computeRepairPotentialScore(candidate);
  const riskFlagCount = computeRrmRiskFlagCount({
    rhythmRiskFlags,
    pressureRiskFlags,
    boundaryRiskFlags,
  });

  const ineligibleReasons: RrmFallbackReason[] = [];

  if (!viewerRrmProfilePresent) {
    ineligibleReasons.push("VIEWER_RRM_PROFILE_MISSING");
  }

  if (hasInvalidRhythmScore(
    candidate.rhythmScoreAtoB,
    candidate.rhythmScoreBtoA,
  )) {
    ineligibleReasons.push("RRM_INPUT_INVALID");
  }

  if (
    candidate.rhythmScoreAtoB === null ||
    candidate.rhythmScoreBtoA === null
  ) {
    ineligibleReasons.push("CANDIDATE_RRM_PROFILE_MISSING");
  }

  if (ineligibleReasons.length > 0) {
    return {
      candidateUserId: candidate.candidateUserId,
      rank: 0,
      AtoBRrmFit: null,
      BtoARrmFit: null,
      mutualRrmFit: null,
      rhythmRiskFlags,
      pressureRiskFlags,
      boundaryRiskFlags,
      repairPotentialSignals,
      repairPotentialScore,
      riskFlagCount,
      missingSignals: buildMissingSignals(candidate),
      fallbackReason: ineligibleReasons[0] ?? null,
      eligible: false,
      ineligibleReasons,
    };
  }

  const aToB = computeAtoBRrmFit({ rhythmScore: candidate.rhythmScoreAtoB });
  const bToA = computeBtoARrmFit({ rhythmScore: candidate.rhythmScoreBtoA });

  if (aToB === null || bToA === null) {
    return {
      candidateUserId: candidate.candidateUserId,
      rank: 0,
      AtoBRrmFit: null,
      BtoARrmFit: null,
      mutualRrmFit: null,
      rhythmRiskFlags,
      pressureRiskFlags,
      boundaryRiskFlags,
      repairPotentialSignals,
      repairPotentialScore,
      riskFlagCount,
      missingSignals: buildMissingSignals(candidate),
      fallbackReason: "CANDIDATE_RRM_PROFILE_MISSING",
      eligible: false,
      ineligibleReasons: ["CANDIDATE_RRM_PROFILE_MISSING"],
    };
  }

  const mutual = computeMutualRrmFit(aToB, bToA);

  return {
    candidateUserId: candidate.candidateUserId,
    rank: 0,
    AtoBRrmFit: aToB,
    BtoARrmFit: bToA,
    mutualRrmFit: mutual,
    rhythmRiskFlags,
    pressureRiskFlags,
    boundaryRiskFlags,
    repairPotentialSignals,
    repairPotentialScore,
    riskFlagCount,
    missingSignals: [],
    fallbackReason: null,
    eligible: true,
    ineligibleReasons: [],
  };
}

function computeWouldChange20DWinner(
  selectedByRrm: string | null,
  selectedBy20D: string | null,
): boolean {
  return (
    selectedByRrm != null &&
    selectedBy20D != null &&
    selectedByRrm !== selectedBy20D
  );
}

function buildReasonSummary(params: {
  top2Available: boolean;
  viewerOk: boolean;
  insufficientSignal: boolean;
  selectedByRrm: string | null;
  selectedBy20D: string | null;
}): string {
  if (!params.top2Available) {
    return "stage3_rrm_skipped_top2_not_available";
  }
  if (!params.viewerOk) {
    return "stage3_rrm_fallback_viewer_profile_missing";
  }
  if (params.insufficientSignal) {
    return "stage3_rrm_fallback_insufficient_signal_use_20d_winner";
  }
  if (
    params.selectedByRrm != null &&
    params.selectedBy20D != null &&
    params.selectedByRrm === params.selectedBy20D
  ) {
    return "stage3_rrm_selected_matches_20d_winner";
  }
  if (computeWouldChange20DWinner(params.selectedByRrm, params.selectedBy20D)) {
    return "stage3_rrm_selected_differs_from_20d_winner";
  }
  return "stage3_rrm_selected";
}

export function buildRrmTop2FinalSelectorShadowV1(
  input: RrmTop2FinalSelectorInputV1,
): RrmTop2FinalSelectorShadowV1 {
  assertR5aSourcePoolType(input.sourcePoolType);

  const top2CandidateIds = dedupeTop2Ids(input.stage2TwentyD.top2CandidateIds);
  const selectedBy20DOnlyCandidateId =
    input.stage2TwentyD.selectedBy20DOnlyCandidateId;
  const top2Available = top2CandidateIds.length >= MAX_TOP2;
  const viewerOk = input.viewerRrmProfilePresent === true;

  const candidateById = new Map<string, RrmTop2CandidateInputV1>();
  for (const c of input.candidates) {
    const id = String(c.candidateUserId ?? "").trim();
    if (!id || candidateById.has(id)) continue;
    candidateById.set(id, c);
  }

  const evaluatedCandidateIds: string[] = [];
  const rankedRows: RrmTop2RankedCandidateV1[] = [];

  if (top2Available) {
    for (const id of top2CandidateIds) {
      evaluatedCandidateIds.push(id);
      const row = candidateById.get(id);
      if (row) {
        rankedRows.push(evaluateCandidate(row, viewerOk));
      } else {
        rankedRows.push(
          evaluateCandidate(
            {
              candidateUserId: id,
              rhythmScoreAtoB: null,
              rhythmScoreBtoA: null,
            },
            viewerOk,
          ),
        );
      }
    }
  }

  const sortRows: RrmCandidateSortRowV1[] = [];
  for (const row of rankedRows) {
    if (
      !row.eligible ||
      row.AtoBRrmFit == null ||
      row.BtoARrmFit == null ||
      row.mutualRrmFit == null
    ) {
      continue;
    }
    sortRows.push({
      candidateUserId: row.candidateUserId,
      AtoBRrmFit: row.AtoBRrmFit,
      BtoARrmFit: row.BtoARrmFit,
      mutualRrmFit: row.mutualRrmFit,
      riskFlagCount: row.riskFlagCount,
      repairPotentialScore: row.repairPotentialScore,
    });
  }

  const sorted = sortRrmTop2Candidates(sortRows);

  let insufficientSignal = false;
  if (viewerOk && top2Available && sorted.length >= 2) {
    insufficientSignal = sortKeysFullyTied(sorted[0]!, sorted[1]!);
  }

  let selectedByRrmCandidateId: string | null = null;

  if (!top2Available) {
    selectedByRrmCandidateId = null;
  } else if (!viewerOk || sorted.length === 0) {
    selectedByRrmCandidateId = selectedBy20DOnlyCandidateId;
  } else if (insufficientSignal) {
    selectedByRrmCandidateId = selectedBy20DOnlyCandidateId;
  } else {
    selectedByRrmCandidateId = sorted[0]!.candidateUserId;
  }

  const wouldChange20DWinner = insufficientSignal
    ? false
    : computeWouldChange20DWinner(
        selectedByRrmCandidateId,
        selectedBy20DOnlyCandidateId,
      );

  const rankById = new Map(
    sorted.map((row, index) => [row.candidateUserId, index + 1]),
  );
  for (const row of rankedRows) {
    if (row.eligible && rankById.has(row.candidateUserId)) {
      row.rank = rankById.get(row.candidateUserId) ?? 0;
    }
  }

  rankedRows.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.rank > 0 && b.rank > 0 && a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    if (a.rank > 0) return -1;
    if (b.rank > 0) return 1;
    return a.candidateUserId.localeCompare(b.candidateUserId);
  });

  const reasonSummary = buildReasonSummary({
    top2Available,
    viewerOk,
    insufficientSignal,
    selectedByRrm: selectedByRrmCandidateId,
    selectedBy20D: selectedBy20DOnlyCandidateId,
  });

  return {
    schemaVersion: RRM_TOP2_FINAL_SELECTOR_SCHEMA_VERSION,
    sourceVersion: RRM_TOP2_FINAL_SELECTOR_SOURCE_VERSION,
    viewerUserId: input.viewerUserId,
    sourcePoolType: R5A_SOURCE_POOL_TYPE,
    generatedAt: input.generatedAt,
    stage1: {
      sourceVersion: input.stage1.sourceVersion,
      selectedCandidateIds: [...input.stage1.selectedCandidateIds],
      poolId: input.stage1.poolId,
    },
    stage2TwentyD: {
      sourceVersion: input.stage2TwentyD.sourceVersion,
      top2CandidateIds: [...top2CandidateIds],
      selectedBy20DOnlyCandidateId,
    },
    stage3Rrm: {
      evaluatedCandidateIds: top2Available ? [...evaluatedCandidateIds] : [],
      rankedCandidates: rankedRows,
      selectedByRrmCandidateId,
      wouldChange20DWinner,
      reasonSummary,
      appliedToMatchResult: false,
    },
    comparisons: {},
    finalShadow: {
      stage3SelectedCandidateId: selectedByRrmCandidateId,
      applied: false,
      appliedToPool: false,
      appliedToFinalScore: false,
      appliedToMatchResult: false,
      appliedToWorkerRanking: false,
    },
  };
}
