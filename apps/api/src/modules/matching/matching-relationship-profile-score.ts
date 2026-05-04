/**
 * M6.0-C / M6.0-E: viewer-safe `relationshipProfileScore` for GET `/matching/result`.
 * M6.0-E: prefer structured `matchInsights.scoreShadow` (worker); else fallback to `reasonSummary` breakdown.
 */

import type { ViewerSafeScoreBreakdown } from "./matching-score-breakdown";

export type RelationshipProfileScoreShadowSource =
  | "match_insights_score_shadow"
  | "score_breakdown_profile_score"
  | "missing";

export type ViewerSafeRelationshipProfileScoreShadow = {
  score: number | null;
  source: RelationshipProfileScoreShadowSource;
};

const SCORING_VERSION_M60 = "m6.0-profile-score-shadow-v1";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function isUnitInterval01(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
}

/**
 * Reads worker-persisted `matchInsights.scoreShadow` when valid (M6.0-E).
 * Returns `relationshipProfileScore` only if `scoringVersion` and `finalScoreV1` are also valid [0,1].
 */
export function tryReadRelationshipProfileScoreFromScoreShadow(
  matchInsights: unknown,
): number | null {
  if (!isRecord(matchInsights)) return null;
  const sh = matchInsights.scoreShadow;
  if (!isRecord(sh)) return null;
  if (sh.scoringVersion !== SCORING_VERSION_M60) return null;
  if (!isUnitInterval01(sh.finalScoreV1)) return null;
  if (!isUnitInterval01(sh.relationshipProfileScore)) return null;
  return sh.relationshipProfileScore;
}

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
 * Prefer `matchInsights.scoreShadow` (M6.0-E); else `reasonSummary` → scoreBreakdown (M6.0-C).
 */
export function resolveRelationshipProfileScoreShadow(
  matchInsights: unknown,
  breakdown: ViewerSafeScoreBreakdown,
): ViewerSafeRelationshipProfileScoreShadow {
  const fromInsights = tryReadRelationshipProfileScoreFromScoreShadow(matchInsights);
  if (fromInsights != null) {
    return { score: fromInsights, source: "match_insights_score_shadow" };
  }
  return buildRelationshipProfileScoreShadow(breakdown);
}
