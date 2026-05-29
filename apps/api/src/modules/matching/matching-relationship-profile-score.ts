/**
 * M6.0-C / M6.0-r10: viewer-safe `relationshipProfileScore` for GET `/matching/result`.
 * Prefer validated `matchInsights.scoreShadowV2` (0–100 → 0–1); else `reasonSummary` → scoreBreakdown (M6.0-C).
 */

import type { ViewerSafeScoreBreakdown } from "./matching-score-breakdown";
import { resolveRelationshipProfileScoreV2Shadow } from "./matching-relationship-profile-score-v2";

export type RelationshipProfileScoreShadowSource =
  /** Legacy API value for old rows; new resolver does not set this from v1 read. */
  | "match_insights_score_shadow"
  | "match_insights_score_shadow_v2"
  | "score_breakdown_profile_score"
  | "missing";

export type ViewerSafeRelationshipProfileScoreShadow = {
  score: number | null;
  source: RelationshipProfileScoreShadowSource;
};

/**
 * When `breakdown.profileScore` is a finite number, expose it as the shadow relationship score (M6.0-C fallback).
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

/**
 * Prefer validated `scoreShadowV2` (viewer-safe projection); else `reasonSummary` → scoreBreakdown.
 */
export function resolveRelationshipProfileScoreShadow(
  matchInsights: unknown,
  breakdown: ViewerSafeScoreBreakdown,
): ViewerSafeRelationshipProfileScoreShadow {
  const v2 = resolveRelationshipProfileScoreV2Shadow(matchInsights);
  if (v2.source === "match_insights_score_shadow_v2" && typeof v2.displayScore100 === "number") {
    return { score: v2.displayScore100 / 100, source: "match_insights_score_shadow_v2" };
  }
  return buildRelationshipProfileScoreShadow(breakdown);
}
