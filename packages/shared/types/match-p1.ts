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

export type MatchInsightsTop2ScoreSnapshotItem = {
  candidateUserId: string;
  rank: 1 | 2;
  finalScore: number | null;
  displayScore100: number | null;
  band: "strong_conflict" | "low" | "medium" | "good" | "high" | null;
  components: {
    previewPoolScore: number | null;
    preferenceScore: number | null;
    styleScore: number | null;
    profileScore: number | null;
    finalScore: number | null;
  };
  scoreOwnerCandidateUserId: string;
};

export type MatchInsightsTop2ScoreSnapshot = {
  schemaVersion: 1;
  sourceType: "top2_score_snapshot";
  sourceVersion: "m6.10-top2-score-snapshot-v1";
  items: MatchInsightsTop2ScoreSnapshotItem[];
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

/** M6.3-r3: bounded decision dry-run meta (audit only; does not change MatchResult). */
export const MATCH_INSIGHTS_RRM_BOUNDED_DECISION_SOURCE_VERSION =
  "m6.3-rrm-bounded-decision-v1" as const;

export type MatchInsightsRrmBoundedDecisionRef = {
  kind: "user";
  id?: string;
  redacted?: boolean;
};

export type MatchInsightsRrmBoundedDecisionDecision =
  | "would_use_baseline"
  | "would_switch_to_rrm"
  | "fallback_baseline";

export type MatchInsightsRrmBoundedDecisionSource =
  | "baseline"
  | "rrm_shadow_bounded"
  | "fallback";

export type MatchInsightsRrmBoundedDecisionFallbackReason =
  | "flag_off"
  | "missing_shadow"
  | "shadow_not_switch"
  | "malformed_shadow"
  | "missing_score_shadow_v2"
  | "missing_selected_top2"
  | "target_not_in_top2"
  | "missing_candidate_user"
  | "missing_candidate_profile"
  | "guardrail_blocked"
  | "context_flags_high_risk"
  | "source_version_mismatch"
  | "evaluation_gate_not_satisfied"
  | "unexpected_exception";

export type MatchInsightsRrmBoundedDecision = {
  schemaVersion: 1;
  sourceType: "rrm_bounded_decision";
  sourceVersion: typeof MATCH_INSIGHTS_RRM_BOUNDED_DECISION_SOURCE_VERSION;
  mode: "dry_run";
  decision: MatchInsightsRrmBoundedDecisionDecision;
  baselineRef: MatchInsightsRrmBoundedDecisionRef;
  boundedRef?: MatchInsightsRrmBoundedDecisionRef;
  decisionSource: MatchInsightsRrmBoundedDecisionSource;
  wouldSwitch: boolean;
  fallbackUsed: boolean;
  fallbackReason: MatchInsightsRrmBoundedDecisionFallbackReason | null;
  guardrails: {
    blocked: boolean;
    blockReasons: string[];
  };
  inputPresence: {
    scoreShadowV2: boolean;
    rrmDecisionShadow: boolean;
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
  top2ScoreSnapshot?: MatchInsightsTop2ScoreSnapshot;
  /** M6.1-r3: optional; only written when `PEIMA_M6_RRM_DECISION_SHADOW_ENABLED=1`. */
  rrmDecisionShadow?: MatchInsightsRrmDecisionShadow;
  /** M6.3-r3: optional dry-run; only when `PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED=1`. */
  rrmBoundedDecision?: MatchInsightsRrmBoundedDecision;
};
