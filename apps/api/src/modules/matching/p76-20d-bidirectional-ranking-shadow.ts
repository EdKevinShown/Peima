/**
 * P7.6-r4a: build TwentyDBidirectionalRankingShadowV1 (pure; no Prisma / env / DB).
 */

import {
  computeAtoB20DFit,
  computeBtoA20DFit,
  computeImbalancePenaltyRecord,
  computeMutual20DFit,
  sortTwentyDRankedCandidates,
} from "./p76-20d-bidirectional-ranking-scoring";
import {
  TWENTY_D_BIDIRECTIONAL_RANKING_SCHEMA_VERSION,
  TWENTY_D_BIDIRECTIONAL_RANKING_SOURCE_VERSION,
  type TwentyDBidirectionalRankingInputV1,
  type TwentyDBidirectionalRankingShadowV1,
  type TwentyDCandidateInputV1,
  type TwentyDCandidateRankedResultV1,
  type TwentyDFallbackReason,
  type TwentyDRankedCandidateV1,
} from "./p76-20d-bidirectional-ranking.types";

const R4A_SOURCE_POOL_TYPE = "onboarding_gated_cohort" as const;
const DEFAULT_TOP2 = 2;
const DEFAULT_TOP_N_CAP = 20;

function assertR4aSourcePoolType(
  sourcePoolType: TwentyDBidirectionalRankingInputV1["sourcePoolType"],
): void {
  if (sourcePoolType !== R4A_SOURCE_POOL_TYPE) {
    throw new Error(
      `P7.6-r4a builder only supports sourcePoolType=${R4A_SOURCE_POOL_TYPE}, got ${sourcePoolType}`,
    );
  }
}

function hasInvalidScore(...scores: Array<number | null>): boolean {
  for (const s of scores) {
    if (s !== null && !Number.isFinite(s)) return true;
  }
  return false;
}

function buildIneligibleReasons(
  candidate: TwentyDCandidateInputV1,
): TwentyDFallbackReason[] {
  const reasons: TwentyDFallbackReason[] = [];

  if (hasInvalidScore(
    candidate.profileScoreAtoB,
    candidate.preferenceScoreAtoB,
    candidate.profileScoreBtoA,
    candidate.preferenceScoreBtoA,
  )) {
    reasons.push("SCORE_INPUT_INVALID");
  }

  if (
    candidate.profileScoreAtoB === null ||
    candidate.profileScoreBtoA === null
  ) {
    reasons.push("CANDIDATE_PROFILE_MISSING");
  }

  return reasons;
}

function buildReasonTags(
  aToB: number,
  bToA: number,
  mutual: number,
): string[] {
  const reasons: string[] = [];
  if (mutual >= 0.5) reasons.push("mutual_20d_strong");
  if (aToB >= 0.5) reasons.push("profile_pref_fit_a_to_b");
  if (bToA >= 0.5) reasons.push("profile_pref_fit_b_to_a");
  if (aToB > bToA + 0.15) reasons.push("asymmetric_viewer_led");
  if (bToA > aToB + 0.15) reasons.push("asymmetric_candidate_led");
  return reasons;
}

function buildMissingSignals(
  candidate: TwentyDCandidateInputV1,
): string[] {
  const signals: string[] = [];
  if (candidate.preferenceScoreAtoB === null) {
    signals.push("preference_a_to_b_missing");
  }
  if (candidate.preferenceScoreBtoA === null) {
    signals.push("preference_b_to_a_missing");
  }
  return signals;
}

function evaluateCandidate(
  candidate: TwentyDCandidateInputV1,
  viewerProfilePresent: boolean,
): TwentyDRankedCandidateV1 {
  const ineligibleReasons = buildIneligibleReasons(candidate);

  if (!viewerProfilePresent) {
    ineligibleReasons.push("VIEWER_PROFILE_MISSING");
  }

  if (ineligibleReasons.length > 0) {
    return {
      candidateUserId: candidate.candidateUserId,
      rank: 0,
      AtoB20DFit: null,
      BtoA20DFit: null,
      mutual20DFit: null,
      imbalancePenalty: null,
      reasons: [],
      missingSignals: buildMissingSignals(candidate),
      fallbackReason: ineligibleReasons[0] ?? null,
      eligible: false,
      ineligibleReasons,
    };
  }

  const aToB = computeAtoB20DFit({
    profileScoreAtoB: candidate.profileScoreAtoB,
    preferenceScoreAtoB: candidate.preferenceScoreAtoB,
  });
  const bToA = computeBtoA20DFit({
    profileScoreBtoA: candidate.profileScoreBtoA,
    preferenceScoreBtoA: candidate.preferenceScoreBtoA,
  });

  if (aToB === null || bToA === null) {
    const reasons: TwentyDFallbackReason[] = ineligibleReasons.includes(
      "CANDIDATE_PROFILE_MISSING",
    )
      ? ineligibleReasons
      : [...ineligibleReasons, "CANDIDATE_PROFILE_MISSING"];
    return {
      candidateUserId: candidate.candidateUserId,
      rank: 0,
      AtoB20DFit: null,
      BtoA20DFit: null,
      mutual20DFit: null,
      imbalancePenalty: null,
      reasons: [],
      missingSignals: buildMissingSignals(candidate),
      fallbackReason: "CANDIDATE_PROFILE_MISSING",
      eligible: false,
      ineligibleReasons: reasons,
    };
  }

  const mutual = computeMutual20DFit(aToB, bToA);
  const imbalancePenalty = computeImbalancePenaltyRecord(aToB, bToA);

  return {
    candidateUserId: candidate.candidateUserId,
    rank: 0,
    AtoB20DFit: aToB,
    BtoA20DFit: bToA,
    mutual20DFit: mutual,
    imbalancePenalty,
    breakdown: {
      AtoBProfile: candidate.profileScoreAtoB ?? undefined,
      AtoBPreference: candidate.preferenceScoreAtoB ?? undefined,
      BtoAProfile: candidate.profileScoreBtoA ?? undefined,
      BtoAPreference: candidate.preferenceScoreBtoA ?? undefined,
    },
    reasons: buildReasonTags(aToB, bToA, mutual),
    missingSignals: buildMissingSignals(candidate),
    fallbackReason: null,
    eligible: true,
    ineligibleReasons: [],
  };
}

function pickTopIds(
  sorted: TwentyDCandidateRankedResultV1[],
  limit: number,
): string[] {
  const n = Math.max(0, Math.floor(limit));
  return sorted.slice(0, n).map((row) => row.candidateUserId);
}

export function buildTwentyDBidirectionalRankingShadowV1(
  input: TwentyDBidirectionalRankingInputV1,
): TwentyDBidirectionalRankingShadowV1 {
  assertR4aSourcePoolType(input.sourcePoolType);

  const viewerOk = input.viewerProfilePresent === true;
  const top2Limit = input.top2 ?? DEFAULT_TOP2;
  const topNLimit = Math.min(
    input.topN ?? input.stage1.selectedCandidateIds.length,
    DEFAULT_TOP_N_CAP,
  );

  const seen = new Set<string>();
  const rankedRows: TwentyDRankedCandidateV1[] = [];

  for (const candidate of input.candidates) {
    if (seen.has(candidate.candidateUserId)) continue;
    seen.add(candidate.candidateUserId);
    rankedRows.push(evaluateCandidate(candidate, viewerOk));
  }

  const scored: TwentyDCandidateRankedResultV1[] = [];
  for (const row of rankedRows) {
    if (
      !row.eligible ||
      row.AtoB20DFit == null ||
      row.BtoA20DFit == null ||
      row.mutual20DFit == null
    ) {
      continue;
    }
    scored.push({
      candidateUserId: row.candidateUserId,
      AtoB20DFit: row.AtoB20DFit,
      BtoA20DFit: row.BtoA20DFit,
      mutual20DFit: row.mutual20DFit,
    });
  }

  const sorted = sortTwentyDRankedCandidates(scored);

  const topNCandidateIds = viewerOk ? pickTopIds(sorted, topNLimit) : [];
  const top2CandidateIds = viewerOk ? pickTopIds(sorted, top2Limit) : [];
  const selectedBy20DOnlyCandidateId = top2CandidateIds[0] ?? null;

  const rankById = new Map(
    sorted.map((row, index) => [row.candidateUserId, index + 1]),
  );
  for (const row of rankedRows) {
    if (row.eligible && rankById.has(row.candidateUserId)) {
      row.rank = rankById.get(row.candidateUserId) ?? 0;
    }
  }

  const ineligibleRows = rankedRows.filter((r) => !r.eligible);
  for (const row of ineligibleRows) {
    row.rank = 0;
  }

  rankedRows.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.rank !== b.rank && a.rank > 0 && b.rank > 0) {
      return a.rank - b.rank;
    }
    if (a.rank > 0) return -1;
    if (b.rank > 0) return 1;
    return a.candidateUserId.localeCompare(b.candidateUserId);
  });

  return {
    schemaVersion: TWENTY_D_BIDIRECTIONAL_RANKING_SCHEMA_VERSION,
    sourceVersion: TWENTY_D_BIDIRECTIONAL_RANKING_SOURCE_VERSION,
    viewerUserId: input.viewerUserId,
    sourcePoolType: R4A_SOURCE_POOL_TYPE,
    generatedAt: input.generatedAt,
    stage1: {
      sourceVersion: input.stage1.sourceVersion,
      selectedCandidateIds: [...input.stage1.selectedCandidateIds],
      poolId: input.stage1.poolId,
    },
    stage2TwentyD: {
      rankedCandidates: rankedRows,
      topNCandidateIds,
      top2CandidateIds,
      selectedBy20DOnlyCandidateId,
      appliedToFinalScore: false,
    },
    comparisons: {},
    finalShadow: {
      stage2Top2CandidateIds: [...top2CandidateIds],
      applied: false,
      appliedToPool: false,
      appliedToFinalScore: false,
      appliedToMatchResult: false,
      appliedToWorkerRanking: false,
    },
  };
}
