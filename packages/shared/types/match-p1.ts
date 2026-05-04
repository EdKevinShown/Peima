/** P1-1 structured insights on MatchResult.matchInsights (JSON). Key names are contract. */

/** M6.0-E: worker-written shadow; optional on older rows. */
export type MatchInsightsScoreShadowM60 = {
  finalScoreV1: number;
  relationshipProfileScore: number;
  scoringVersion: "m6.0-profile-score-shadow-v1";
};

/** M6.0-J3: worker-written V2 shadow; optional on older rows. */
export type MatchInsightsScoreShadowV2 = {
  scoringVersion: "m6.0-relationship-profile-score-v2-shadow";
  rawCompatibilityScore: number;
  weightedBaseScore: number;
  penaltyTotal: number;
  cappedRawScore: number;
  displayScore100: number;
  band: "strong_conflict" | "low" | "medium" | "good" | "high";
  capApplied: number | null;
  coreConflictCount: number;
  strongConflictCount: number;
  redFlagConflictCount: number;
  validAxisCount: number;
  skippedAxisCount: number;
  source: "profile_v2_shadow" | "insufficient_profile";
};

/** M6.0-R3: worker-written shadow; R2B selector output for future RRM (no RRM call in worker). */
export const MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION =
  "m6.0-rrm-v2-top2-selector-shadow-v1" as const;

export type MatchInsightsRrmV2Top2SelectorReason =
  | "ok"
  | "not_enough_valid_v2_candidates"
  | "invalid_score_shadow_v2";

export type MatchInsightsRrmV2Top2SelectorShadow = {
  version: typeof MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION;
  eligible: boolean;
  selectedTop2: Array<{
    candidateUserId: string;
    displayScore100: number;
    band: "strong_conflict" | "low" | "medium" | "good" | "high";
  }>;
  top1CandidateUserId: string | null;
  top2CandidateUserId: string | null;
  top2Gap: number | null;
  contextFlags: {
    top2GapLarge: boolean;
    hasLowBand: boolean;
    hasStrongConflictBand: boolean;
    anyBelowSuggestedFloor: boolean;
  };
  thresholds: {
    suggestedFloorDisplayScore100: number;
    largeGapThreshold: number;
  };
  reason: MatchInsightsRrmV2Top2SelectorReason;
};

export type MatchInsights = {
  explanation: {
    whyMatch: string;
    strengths: string[];
    cautions: string[];
    rhythmPrediction: string;
  };
  riskFlags: string[];
  openingTopics: string[];
  chatSimulationSummary: string;
  scoreShadow?: MatchInsightsScoreShadowM60;
  scoreShadowV2?: MatchInsightsScoreShadowV2;
  rrmV2Top2Selector?: MatchInsightsRrmV2Top2SelectorShadow;
};
