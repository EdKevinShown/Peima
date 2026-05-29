/**
 * P7.10-r3a — P7.6 canonical writer dry-run payload (pure; no DB / MatchResult writes).
 */

export const P76_CANONICAL_WRITER_DRY_RUN_SCHEMA_VERSION = 1 as const;

export const P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION =
  "p7.10-r3-canonical-writer-v1" as const;

export const P76_CANONICAL_WRITER_DRY_RUN_SOURCE_TYPE =
  "p76_canonical_writer" as const;

export type P76CanonicalWriterDryRunMode = "dry_run";

export type P76CanonicalWriterDryRunGuardrailReason =
  | "ok"
  | "missing_viewer"
  | "missing_selected_candidate"
  | "missing_stage1"
  | "missing_stage2"
  | "missing_stage3"
  | "rolled_back"
  | "violation_blocked"
  | "stale_source_version"
  | "candidate_missing"
  | "score_missing"
  | "safe_fallback_required"
  | "not_allowlisted"
  | "exception";

export type P76CanonicalWriterDryRunPayloadV1 = {
  schemaVersion: 1;
  sourceType: "p76_canonical_writer";
  sourceVersion: string;
  mode: "dry_run";

  viewerUserId: string;
  selectedCandidateId: string | null;
  score: number | null;
  reasonSummary: string | null;

  stageSummary: {
    stage1PhotoVisual?: unknown;
    stage2Ranking?: unknown;
    stage3Rrm?: unknown;
  };

  safeFallbackMeta: {
    safeFallbackRequired: boolean;
    reason: string | null;
  };

  guardrails: {
    eligible: boolean;
    reason: P76CanonicalWriterDryRunGuardrailReason;
    blockedReasons: P76CanonicalWriterDryRunGuardrailReason[];
  };

  appliedToMatchResult: false;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;

  createdAt: string;
};

export type P76CanonicalWriterDryRunBuildInputV1 = {
  viewerUserId: string;
  /** Cohort freeze label (design default from P7.10-r3). */
  sourceVersion?: string;
  createdAt?: string;
  /** When non-empty, viewer must be listed for eligibility. */
  viewerAllowlist?: string[];
  stage1PhotoVisual?: unknown;
  stage2Ranking?: unknown;
  stage3Rrm?: unknown;
  /** Overrides stage3 `selectedByRrmCandidateId` when set. */
  selectedCandidateId?: string | null;
  score?: number | null;
  reasonSummary?: string | null;
  rolledBack?: boolean;
  violationStatus?: string | null;
  /** When set, must match `sourceVersion` or `stale_source_version`. */
  cohortSourceVersion?: string | null;
  /** When false, `candidate_missing` if a selected candidate id is present. */
  candidateExists?: boolean;
  resolverError?: unknown;
};
