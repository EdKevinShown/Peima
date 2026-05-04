import type { MatchInsights, MatchInsightsScoreShadowV2 } from "@peima/shared/types";
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

/**
 * P1-1 placeholder + M6 scoreShadow v1 + M6.0-J3 scoreShadowV2 (relationship profile V2).
 * Does not read questionnaire answers, user ids, or RRM payloads.
 */
export function buildWorkerMatchInsightsForBestMatch(params: {
  components: ScoreComponentsV1;
  candidate: CandidateUserLike;
  viewerProfile: UserProfileLike;
  candidateProfile: UserProfileLike;
}): MatchInsights {
  const base = buildMatchInsightsPlaceholder(
    params.components,
    params.candidate,
  );
  const v2 = computeRelationshipProfileScoreV2(
    params.viewerProfile ?? undefined,
    params.candidateProfile ?? undefined,
  );
  return {
    ...base,
    scoreShadow: buildScoreShadowM60(params.components),
    scoreShadowV2: toScoreShadowV2(v2),
  };
}
