/** Persisted JSON in `MatchResultRrmTop2DisplayMeta.meta` (M5.3-C1). */
export const MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION = 1 as const;

export const MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE = "rrm_top2_bounded_selector" as const;

/** Explicit guardrails snapshot on RRM Top2 display meta (M5.5-M0.2); eligibility reads this only — not matchInsights placeholders. */
export type RrmTop2DisplayMetaGuardrailsV1 = {
  status: "pass" | "caution" | "block" | "not_evaluated";
  blockReasons: string[];
  cautionReasons: string[];
  sourceVersion?: string;
};

/**
 * Viewer-safe decision trace for RRM Top2 bounded display (no raw RRM dimensions / prompts).
 * Aligns with M5.3-A §14.3 naming; `schemaVersion` is the JSON envelope version.
 */
export type MatchResultRrmTop2DisplayMetaV1 = {
  schemaVersion: typeof MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION;
  sourceType: typeof MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE;
  sourceVersion: string;
  baselineCandidateUserId: string;
  previousDisplayCandidateUserId: string;
  newDisplayCandidateUserId: string;
  decisionRule: string;
  top2Fingerprint: string;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  rollbackAvailable: boolean;
  /** Required for RRM Top2 display eligibility (M5.5-M0.2); omit → `guardrails_missing`. */
  guardrails?: RrmTop2DisplayMetaGuardrailsV1;
};

/** GET-safe projection of `MatchResultRrmTop2DisplayMetaV1` (subset / same surface for v1). */
export type ViewerSafeRrmTop2DisplayMeta = {
  sourceType: typeof MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE;
  sourceVersion: string;
  baselineCandidateUserId: string;
  previousDisplayCandidateUserId: string;
  newDisplayCandidateUserId: string;
  decisionRule: string;
  top2Fingerprint: string;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  rollbackAvailable: boolean;
  guardrails?: RrmTop2DisplayMetaGuardrailsV1;
};
