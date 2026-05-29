/**
 * P7.10-r6 — P7.6 canonical writer shadow payload (viewer-safe; no DB writes).
 */

export const P76_CANONICAL_WRITER_SHADOW_SCHEMA_VERSION = 1 as const;

export const P76_CANONICAL_WRITER_SHADOW_SOURCE_VERSION =
  "p7.10-r6-p76-canonical-writer-shadow-v1" as const;

export const P76_CANONICAL_WRITER_SHADOW_PIPELINE_VERSION =
  "p76-canonical-shadow-v1" as const;

export const P76_CANONICAL_WRITER_SHADOW_SCORE_VERSION =
  "p76-canonical-shadow-score-v1" as const;

export const P76_CANONICAL_WRITER_SHADOW_SOURCE_TYPE =
  "p76_canonical_writer_shadow" as const;

export type P76CanonicalWriterShadowScoreDeltaBand =
  | "none"
  | "small"
  | "medium"
  | "large"
  | "unknown";

export type P76CanonicalWriterShadowGuardrailReason =
  | "ok"
  | "disabled"
  | "missing_baseline"
  | "missing_sidecar"
  | "candidate_missing"
  | "stale_sidecar"
  | "rolled_back"
  | "violation_row"
  | "not_allowlisted"
  | "env_disabled"
  | "exception";

export type P76CanonicalWriterShadowProvenanceInputSource =
  | "p76_allowlist_sidecar"
  | "p76_read_path_display"
  | "baseline_match_result"
  | "manual_admin_apply"
  | "unavailable";

export type P76CanonicalWriterShadowPayloadV1 = {
  schemaVersion: typeof P76_CANONICAL_WRITER_SHADOW_SCHEMA_VERSION;
  sourceType: typeof P76_CANONICAL_WRITER_SHADOW_SOURCE_TYPE;
  sourceVersion: typeof P76_CANONICAL_WRITER_SHADOW_SOURCE_VERSION;
  pipelineVersion: typeof P76_CANONICAL_WRITER_SHADOW_PIPELINE_VERSION;
  generatedAt: string;

  mode: "shadow";
  appliedToMatchResult: false;

  inputPresence: {
    hasBaselineMatchResult: boolean;
    hasAllowlistSidecar: boolean;
    hasDisplayCandidate: boolean;
    hasFinalScore: boolean;
  };

  baseline: {
    candidateUserId: string | null;
    finalScore: number | null;
    displaySourceType?: string | null;
  };

  proposal: {
    selectedCandidateUserId: string | null;
    score: number | null;
    scoreVersion: string;
    decisionRule: string;
  };

  comparison: {
    wouldChangeCandidate: boolean;
    scoreDelta: number | null;
    scoreDeltaBand: P76CanonicalWriterShadowScoreDeltaBand;
  };

  provenance: {
    inputSource: P76CanonicalWriterShadowProvenanceInputSource;
    allowlistApplyMetaId?: string | null;
    sourceVersion?: string | null;
    fallbackPolicy: "safe_fallback_v1";
  };

  guardrails: {
    eligible: boolean;
    reason: P76CanonicalWriterShadowGuardrailReason;
  };

  notes?: string[];
};

export type P76CanonicalWriterShadowBaselineInputV1 = {
  candidateUserId: string | null;
  finalScore: number | null;
  displaySourceType?: string | null;
};

export type P76CanonicalWriterShadowBuildInputV1 = {
  viewerUserId: string;
  generatedAt?: string;
  baseline?: P76CanonicalWriterShadowBaselineInputV1 | null;
  /** Allowlist sidecar row shape (subset used by builder). */
  sidecar?: {
    id: string;
    viewerUserId: string;
    selectedCandidateId: string;
    sourceVersion: string;
    allowlistMatched: boolean;
    pmSignoffStatus: string;
    opsSignoffStatus: string;
    applied: boolean;
    dryRun: boolean;
    rolledBack: boolean;
    appliedToMatchResult: boolean;
    appliedToFinalScore: boolean;
    appliedToWorkerRanking: boolean;
    appliedToDisplay: boolean;
  } | null;
  displayCandidateUserId?: string | null;
  /** When false, sidecar candidate is treated as missing. */
  sidecarCandidateExists?: boolean;
  resolverError?: unknown;
  notes?: string[];
};
