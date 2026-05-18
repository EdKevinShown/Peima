/**
 * P7.6-r8b — allowlist apply sidecar contracts (Route C shadow → sidecar only).
 */

export const P76_ALLOWLIST_APPLY_META_SCHEMA_VERSION =
  "p7.6-allowlist-apply-meta-v1" as const;

export const P76_ALLOWLIST_APPLY_WRITER_SOURCE_VERSION =
  "p7.6-r8b-allowlist-apply-writer-v1" as const;

export const P76_ALLOWLIST_APPLY_SOURCE_PIPELINE = "p7.6_route_c" as const;

export const P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION =
  "p7.6-r7j3-staging-cohort-v1" as const;

export type P76AllowlistSignoffStatus = "pending" | "approved" | "rejected";

export type P76AllowlistApplyBlockedReason =
  | "apply_disabled"
  | "env_dry_run"
  | "viewer_not_allowlisted"
  | "pm_signoff_required"
  | "pm_signoff_rejected"
  | "ops_signoff_required"
  | "ops_signoff_rejected"
  | "selected_candidate_missing"
  | "final_shadow_mismatch"
  | "forbidden_applied_flag"
  | "rolled_back";

export type P76AllowlistApplyMetaV1 = {
  schemaVersion: typeof P76_ALLOWLIST_APPLY_META_SCHEMA_VERSION;
  sourceVersion: string;
  viewerUserId: string;
  selectedCandidateId: string;
  sourcePipeline: typeof P76_ALLOWLIST_APPLY_SOURCE_PIPELINE;
  stage1SelectedCandidateIds: string[];
  stage2Top2CandidateIds: string[];
  selectedBy20DOnlyCandidateId: string | null;
  selectedByRrmCandidateId: string | null;
  finalShadowSelectedCandidateId: string;
  allowlistMatched: boolean;
  pmSignoffStatus: P76AllowlistSignoffStatus;
  opsSignoffStatus: P76AllowlistSignoffStatus;
  applied: boolean;
  appliedToPool: boolean;
  appliedToMatchResult: boolean;
  appliedToFinalScore: boolean;
  appliedToDisplay: boolean;
  appliedToWorkerRanking: boolean;
  dryRun: boolean;
  rolledBack: boolean;
  auditNotes: Record<string, unknown>;
};

export type P76AllowlistApplyInputV1 = {
  viewerUserId: string;
  selectedCandidateId: string;
  sourceVersion: string;
  routeCArtifactPath?: string | null;
  stage1SelectedCandidateIds: string[];
  stage2Top2CandidateIds: string[];
  selectedBy20DOnlyCandidateId?: string | null;
  selectedByRrmCandidateId?: string | null;
  finalShadowSelectedCandidateId: string;
  pmSignoffStatus?: P76AllowlistSignoffStatus;
  opsSignoffStatus?: P76AllowlistSignoffStatus;
  /** CLI-requested dry-run; effective dry-run also respects env. */
  cliDryRun: boolean;
  appliedBy?: string | null;
  auditNotes?: Record<string, unknown>;
  /** Must remain false; set true only to trigger validation error in tests. */
  appliedToPool?: boolean;
  appliedToMatchResult?: boolean;
  appliedToFinalScore?: boolean;
  appliedToDisplay?: boolean;
  appliedToWorkerRanking?: boolean;
};

export type P76AllowlistApplyResultV1 = {
  schemaVersion: typeof P76_ALLOWLIST_APPLY_WRITER_SOURCE_VERSION;
  generatedAt: string;
  viewerUserId: string;
  sourceVersion: string;
  effectiveDryRun: boolean;
  wouldApply: boolean;
  wroteSidecar: boolean;
  blocked: boolean;
  blockedReasons: P76AllowlistApplyBlockedReason[];
  allowlistMatched: boolean;
  meta: P76AllowlistApplyMetaV1 | null;
  sidecarRowId: string | null;
  applied: false;
};
