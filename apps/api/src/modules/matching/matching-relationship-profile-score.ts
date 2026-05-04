/**
 * M6.0-C: viewer-safe `relationshipProfileScore` shadow (v1 pipeline).
 * First version: mirrors `scoreBreakdown.profileScore` from parsed `reasonSummary` only.
 * Does not read `user_profile`, questionnaire rows, or DB.
 */

import type { ViewerSafeScoreBreakdown } from "./matching-score-breakdown";

export type RelationshipProfileScoreShadowSource =
  | "score_breakdown_profile_score"
  | "missing";

export type ViewerSafeRelationshipProfileScoreShadow = {
  score: number | null;
  source: RelationshipProfileScoreShadowSource;
};

/**
 * When `breakdown.profileScore` is a finite number, expose it as the shadow relationship score.
 * Otherwise `score` is null and `source` is `missing` (includes parse_failed / missing breakdown).
 */
export function buildRelationshipProfileScoreShadow(
  breakdown: ViewerSafeScoreBreakdown,
): ViewerSafeRelationshipProfileScoreShadow {
  const p = breakdown.profileScore;
  if (typeof p === "number" && Number.isFinite(p)) {
    return { score: p, source: "score_breakdown_profile_score" };
  }
  return { score: null, source: "missing" };
}
