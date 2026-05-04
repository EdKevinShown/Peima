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

/** M6.1-r3: RRM decision shadow (observation only; does not change MatchResult). */
export type MatchInsightsRrmDecisionShadowRef = {
  kind: "match_result" | "user";
  redacted: true;
};

export type MatchInsightsRrmDecisionShadowDecision =
  | "same_as_baseline"
  | "switch_to_top2_candidate"
  | "no_shadow_decision";

export type MatchInsightsRrmDecisionShadowBlockReason =
  | "missing_score_shadow_v2"
  | "missing_rrm_v2_top2_selector"
  | "invalid_selector_payload"
  | "empty_selected_top2"
  | "missing_candidate_user"
  | "missing_candidate_profile"
  | "has_low_band"
  | "has_strong_conflict_band"
  | "any_below_suggested_floor"
  | "top2_gap_large"
  | "reason_not_ok"
  | "eligible_not_true"
  | "parse_error"
  | "unexpected_exception";

export type MatchInsightsRrmDecisionShadow = {
  schemaVersion: 1;
  sourceType: "rrm_decision_shadow";
  sourceVersion: "m6.1-rrm-decision-shadow-v1";
  matchResultRef: MatchInsightsRrmDecisionShadowRef;
  baseline: {
    candidateRef: MatchInsightsRrmDecisionShadowRef;
    source: "worker_current_winner";
    finalScoreBand: "low" | "medium" | "high" | "unknown";
    rank: 1;
  };
  shadow: {
    candidateRef: MatchInsightsRrmDecisionShadowRef;
    rankWithinSelectedTop2: 1 | 2;
    decision: MatchInsightsRrmDecisionShadowDecision;
    reasonCode: string;
    confidenceBand: "low" | "medium" | "high" | "unknown";
  };
  comparison: {
    sameAsBaseline: boolean;
    switchSuggested: boolean;
    top2GapBand: "small" | "medium" | "large" | "unknown";
    scoreDeltaBand: "small" | "medium" | "large" | "unknown";
    riskFlags: string[];
  };
  guardrails: {
    blocked: boolean;
    blockReasons: MatchInsightsRrmDecisionShadowBlockReason[];
    blockedByLowBand: boolean;
    blockedByStrongConflict: boolean;
    blockedByMissingProfile: boolean;
    blockedByInvalidSelector: boolean;
    blockedByBelowSuggestedFloor: boolean;
    blockedByParseError: boolean;
  };
  inputPresence: {
    scoreShadowV2: boolean;
    rrmV2Top2Selector: boolean;
    selectedTop2: boolean;
    scoreShadowV1LegacyPresent: boolean;
  };
  generatedAt: string;
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
  /** M6.1-r3: optional; only written when `PEIMA_M6_RRM_DECISION_SHADOW_ENABLED=1`. */
  rrmDecisionShadow?: MatchInsightsRrmDecisionShadow;
};
