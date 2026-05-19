/**
 * P7.10-r7d — Admin Apply preview payload (pure; no DB / MatchResult writes).
 */

export const P76_CANONICAL_APPLY_PREVIEW_SCHEMA_VERSION = 1 as const;

export const P76_CANONICAL_APPLY_PREVIEW_SOURCE_TYPE =
  "p76_canonical_apply_preview" as const;

export const P76_CANONICAL_APPLY_PREVIEW_SOURCE_VERSION =
  "p7.10-r7d-canonical-apply-preview-v1" as const;

export type P76CanonicalApplyPreviewMode = "preview";

export type P76CanonicalApplyPreviewBlockedReason =
  | "missing_sidecar"
  | "missing_sidecar_id"
  | "missing_match_result"
  | "viewer_mismatch"
  | "missing_selected_candidate"
  | "score_missing"
  | "sidecar_already_promoted"
  | "sidecar_rolled_back"
  | "sidecar_deleted"
  | "sidecar_superseded"
  | "sidecar_applied_to_worker_ranking"
  | "sidecar_applied_to_match_result"
  | "sidecar_applied_to_final_score"
  | "unsafe_environment"
  | "gate12_not_final"
  | "grafana_blocked"
  | "pm_signoff_missing"
  | "ops_signoff_missing"
  | "incident_active"
  | "percent_rollout_active"
  | "worker_deploy_active"
  | "production_write_blocked";

export type P76CanonicalApplyPreviewSidecarSnapshotV1 = {
  id: string;
  auditRunId: string;
  environment: string;
  viewerUserId: string;
  matchResultId: string | null;
  selectedCandidateId: string | null;
  score: number | null;
  reasonSummary: string | null;
  sourceVersion: string | null;
  promotionStatus: string | null;
  appliedToMatchResult: boolean;
  appliedToFinalScore: boolean;
  appliedToWorkerRanking: boolean;
  rolledBack: boolean;
  deletedAt: string | null;
  supersededAt: string | null;
  pmSignoffStatus: string | null;
  opsSignoffStatus: string | null;
};

export type P76CanonicalApplyPreviewMatchResultSnapshotV1 = {
  id: string;
  viewerUserId: string;
  candidateUserId: string | null;
  finalScore: number | null;
  reasonSummary: string | null;
  hasMatchInsights: boolean;
};

export type P76CanonicalApplyPreviewGateResultV1 = {
  id: string;
  pass: boolean;
  blockedReason?: P76CanonicalApplyPreviewBlockedReason;
};

export type P76CanonicalApplyPreviewProposedChangeV1 = {
  candidateWouldChange: boolean;
  scoreWouldChange: boolean;
  reasonSummaryWouldChange: boolean;
  displayWouldChange: boolean;
};

export type P76CanonicalApplyPreviewRollbackPreviewV1 = {
  snapshotAvailable: boolean;
  rollbackTokenRequired: boolean;
  rollbackTokenPreview: "redacted" | null;
};

export type P76CanonicalApplyPreviewSafetyV1 = {
  writesDb: false;
  writesMatchResult: false;
  writesFinalScore: false;
  triggersWorker: false;
  changesPercent: false;
  productionRollout: false;
};

export type P76CanonicalApplyPreviewPayloadV1 = {
  schemaVersion: typeof P76_CANONICAL_APPLY_PREVIEW_SCHEMA_VERSION;
  sourceType: typeof P76_CANONICAL_APPLY_PREVIEW_SOURCE_TYPE;
  sourceVersion: typeof P76_CANONICAL_APPLY_PREVIEW_SOURCE_VERSION;
  mode: P76CanonicalApplyPreviewMode;
  canApply: boolean;
  blockedReasons: P76CanonicalApplyPreviewBlockedReason[];
  sidecar: P76CanonicalApplyPreviewSidecarSnapshotV1 | null;
  currentMatchResult: P76CanonicalApplyPreviewMatchResultSnapshotV1 | null;
  proposedChange: P76CanonicalApplyPreviewProposedChangeV1;
  gateResults: P76CanonicalApplyPreviewGateResultV1[];
  rollbackPreview: P76CanonicalApplyPreviewRollbackPreviewV1;
  safety: P76CanonicalApplyPreviewSafetyV1;
  previewedAt: string;
  previewRequestedBy: string | null;
};

export type P76CanonicalApplyPreviewInputV1 = {
  sidecar?: {
    id: string;
    auditRunId: string;
    environment: "dev" | "staging" | string;
    viewerUserId: string;
    matchResultId?: string | null;
    selectedCandidateId?: string | null;
    score?: number | null;
    reasonSummary?: string | null;
    sourceVersion?: string | null;
    promotionStatus?: string | null;
    appliedToMatchResult?: boolean;
    appliedToFinalScore?: boolean;
    appliedToWorkerRanking?: boolean;
    rolledBack?: boolean;
    deletedAt?: string | Date | null;
    supersededAt?: string | Date | null;
    guardrails?: unknown;
    safeFallbackMeta?: unknown;
    pmSignoffStatus?: string | null;
    opsSignoffStatus?: string | null;
  } | null;
  currentMatchResult?: {
    id: string;
    viewerUserId: string;
    candidateUserId?: string | null;
    finalScore?: number | null;
    reasonSummary?: string | null;
    matchInsights?: unknown;
  } | null;
  context?: {
    gate12Status?: string;
    grafanaStatus?: string;
    pmSignoffRequired?: boolean;
    opsSignoffRequired?: boolean;
    productionWriteRequested?: boolean;
    incidentActive?: boolean;
    percentRolloutActive?: boolean;
    workerDeployActive?: boolean;
    previewRequestedBy?: string;
  };
  previewedAt?: string;
};
