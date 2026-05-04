import type {
  MatchInsights,
  MatchInsightsRrmV2Top2SelectorShadow,
  MatchInsightsScoreShadowV2,
} from "@peima/shared/types";
import { MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION } from "@peima/shared/types";
import { buildMatchInsightsPlaceholder } from "./match-insights-placeholder.js";
import {
  buildScoreShadowM60,
  type CandidateUserLike,
  type ScoreComponentsV1,
  type UserProfileLike,
} from "./matching-score.js";
import {
  computeRelationshipProfileScoreV2,
  type RelationshipProfileScoreV2Result,
} from "./relationship-profile-score-v2.js";
import {
  selectV2Top2Candidates,
  type RrmV2Top2CandidateInput,
  type RrmV2Top2SelectorOptions,
} from "./rrm-v2-top2-selector.js";

function toScoreShadowV2(
  r: RelationshipProfileScoreV2Result,
): MatchInsightsScoreShadowV2 {
  return {
    scoringVersion: r.scoringVersion,
    rawCompatibilityScore: r.rawCompatibilityScore,
    weightedBaseScore: r.weightedBaseScore,
    penaltyTotal: r.penaltyTotal,
    cappedRawScore: r.cappedRawScore,
    displayScore100: r.displayScore100,
    band: r.band,
    capApplied: r.capApplied,
    coreConflictCount: r.coreConflictCount,
    strongConflictCount: r.strongConflictCount,
    redFlagConflictCount: r.redFlagConflictCount,
    validAxisCount: r.validAxisCount,
    skippedAxisCount: r.skippedAxisCount,
    source: r.source,
  };
}

function buildRrmV2Top2SelectorShadowFromSelectorRows(
  rows: readonly RrmV2Top2CandidateInput[],
  options?: RrmV2Top2SelectorOptions,
): MatchInsightsRrmV2Top2SelectorShadow {
  const sel = selectV2Top2Candidates(rows, options);
  return {
    version: MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION,
    eligible: sel.eligible,
    selectedTop2: sel.selectedTop2,
    top1CandidateUserId: sel.top1CandidateUserId,
    top2CandidateUserId: sel.top2CandidateUserId,
    top2Gap: sel.top2Gap,
    contextFlags: sel.contextFlags,
    thresholds: sel.thresholds,
    reason: sel.reason,
  };
}

/**
 * Build `matchInsights.rrmV2Top2Selector` from pre-shaped candidate rows (tests / diagnostics).
 * Production uses {@link buildWorkerMatchInsightsForBestMatch} with `v2SelectorCandidates`.
 */
export function matchInsightsRrmV2Top2SelectorShadowFromCandidateRows(
  rows: readonly RrmV2Top2CandidateInput[],
  options?: RrmV2Top2SelectorOptions,
): MatchInsightsRrmV2Top2SelectorShadow {
  return buildRrmV2Top2SelectorShadowFromSelectorRows(rows, options);
}

function buildRrmV2Top2SelectorShadowFromPool(
  viewerProfile: UserProfileLike,
  pool: ReadonlyArray<{ candidateUserId: string; candidateProfile: UserProfileLike }>,
  options?: RrmV2Top2SelectorOptions,
): MatchInsightsRrmV2Top2SelectorShadow {
  const rows: RrmV2Top2CandidateInput[] = pool.map((row) => {
    const v2 = computeRelationshipProfileScoreV2(
      viewerProfile ?? undefined,
      row.candidateProfile ?? undefined,
    );
    return {
      candidateUserId: row.candidateUserId,
      scoreShadowV2: toScoreShadowV2(v2),
    };
  });
  return buildRrmV2Top2SelectorShadowFromSelectorRows(rows, options);
}

/**
 * P1-1 placeholder + M6 scoreShadow v1 + M6.0-J3 scoreShadowV2 + M6.0-R3 rrmV2Top2Selector shadow.
 * Does not read questionnaire answers as raw payloads, tokens, or RRM outputs.
 */
export function buildWorkerMatchInsightsForBestMatch(params: {
  components: ScoreComponentsV1;
  candidate: CandidateUserLike;
  viewerProfile: UserProfileLike;
  candidateProfile: UserProfileLike;
  /**
   * Batch-scored pool for the same viewer (same queue). When set, writes `rrmV2Top2Selector`
   * using per-row `computeRelationshipProfileScoreV2(viewer, candidateProfile)` — no extra DB.
   */
  v2SelectorCandidates?: ReadonlyArray<{
    candidateUserId: string;
    candidateProfile: UserProfileLike;
  }>;
  v2SelectorOptions?: RrmV2Top2SelectorOptions;
}): MatchInsights {
  const base = buildMatchInsightsPlaceholder(
    params.components,
    params.candidate,
  );
  const v2 = computeRelationshipProfileScoreV2(
    params.viewerProfile ?? undefined,
    params.candidateProfile ?? undefined,
  );
  const out: MatchInsights = {
    ...base,
    scoreShadow: buildScoreShadowM60(params.components),
    scoreShadowV2: toScoreShadowV2(v2),
  };
  if (params.v2SelectorCandidates != null) {
    out.rrmV2Top2Selector = buildRrmV2Top2SelectorShadowFromPool(
      params.viewerProfile,
      params.v2SelectorCandidates,
      params.v2SelectorOptions,
    );
  }
  return out;
}
