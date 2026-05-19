/**
 * P7.10-r8d — canonical Apply service types (hard-disabled by default).
 */

export const P76_CANONICAL_APPLY_SERVICE_SCHEMA_VERSION = 1 as const;

export const P76_CANONICAL_APPLY_SERVICE_SOURCE_TYPE =
  "p76_canonical_apply_service" as const;

export const P76_CANONICAL_APPLY_SERVICE_SOURCE_VERSION =
  "p7.10-r8d-canonical-apply-service-v1" as const;

export const P76_CANONICAL_APPLY_GATE12_PASS =
  "PASS_GATE12_FOR_R8_CONTROLLED_IMPLEMENTATION" as const;

export const P76_CANONICAL_APPLY_GRAFANA_PASS =
  "PASS_GRAFANA_PHYSICAL_IMPORT_AND_TEST_ALERT" as const;

export type P76CanonicalApplyBlockedReason =
  | "apply_execution_disabled"
  | "apply_db_write_disabled"
  | "production_environment_blocked"
  | "invalid_apply_environment"
  | "gate12_not_final"
  | "grafana_not_ready"
  | "pm_signoff_missing"
  | "ops_signoff_missing"
  | "engineering_signoff_missing"
  | "incident_active"
  | "worker_deploy_active"
  | "percent_rollout_active"
  | "sidecar_not_found"
  | "already_promoted"
  | "sidecar_rolled_back"
  | "sidecar_deleted"
  | "sidecar_superseded"
  | "sidecar_applied_to_match_result"
  | "sidecar_applied_to_final_score"
  | "sidecar_applied_to_worker_ranking"
  | "match_result_not_found"
  | "snapshot_not_found"
  | "snapshot_mismatch"
  | "snapshot_already_rolled_back"
  | "baseline_fingerprint_mismatch"
  | "proposal_mismatch"
  | "rollback_token_hash_missing"
  | "viewer_mismatch";

export type P76CanonicalApplyGateContextV1 = {
  gate12Status: string;
  grafanaStatus: string;
  pmSignoffStatus: string;
  opsSignoffStatus: string;
  engineeringSignoffStatus: string;
  incidentActive: boolean;
  workerDeployActive: boolean;
  percentRolloutActive: boolean;
};

export type P76CanonicalApplyEnvV1 = {
  executionEnabled: boolean;
  allowDbWrite: boolean;
  configuredEnvironment: string;
  nodeEnv: string;
  productionPercent: number;
  percentEnabled: boolean;
  applyEnvironmentAllowed: boolean;
  productionBlocked: boolean;
  canExecute: boolean;
};

export type P76CanonicalApplyInputV1 = {
  sidecarId: string;
  snapshotId: string;
  requestedBy: string;
  environment: string;
  gateContext: P76CanonicalApplyGateContextV1;
  now?: string | Date;
};

export type P76CanonicalApplyStateSnapshotV1 = {
  candidateUserId: string | null;
  finalScore: number | null;
  reasonSummary: string | null;
};

export type P76CanonicalApplySafetyV1 = {
  writesDb: boolean;
  writesMatchResult: boolean;
  writesFinalScore: boolean;
  triggersWorker: boolean;
  changesPercent: boolean;
  productionRollout: boolean;
};

export type P76CanonicalApplyAuditV1 = {
  requestedBy: string;
  appliedAt: string | null;
  applyAuditRunId: string | null;
  auditLogWritten: boolean;
};

export type P76CanonicalApplyResultV1 = {
  schemaVersion: typeof P76_CANONICAL_APPLY_SERVICE_SCHEMA_VERSION;
  sourceType: typeof P76_CANONICAL_APPLY_SERVICE_SOURCE_TYPE;
  sourceVersion: typeof P76_CANONICAL_APPLY_SERVICE_SOURCE_VERSION;
  mode: "blocked" | "applied";
  applied: boolean;
  blockedReasons: P76CanonicalApplyBlockedReason[];
  sidecarId: string;
  snapshotId: string;
  matchResultId: string | null;
  before: P76CanonicalApplyStateSnapshotV1 | null;
  after: P76CanonicalApplyStateSnapshotV1 | null;
  safety: P76CanonicalApplySafetyV1;
  audit: P76CanonicalApplyAuditV1;
};

export type P76CanonicalApplySidecarRow = {
  id: string;
  auditRunId: string;
  environment: string;
  viewerUserId: string;
  matchResultId: string | null;
  selectedCandidateId: string;
  score: number | null;
  reasonSummary: string | null;
  sourceVersion: string | null;
  promotionStatus: string;
  appliedToMatchResult: boolean;
  appliedToFinalScore: boolean;
  appliedToWorkerRanking: boolean;
  rolledBack: boolean;
  deletedAt: Date | null;
  supersededAt: Date | null;
  pmSignoffStatus: string;
  opsSignoffStatus: string;
};

export type P76CanonicalApplySnapshotRow = {
  id: string;
  snapshotId: string;
  sidecarId: string;
  matchResultId: string;
  viewerUserId: string;
  beforeCandidateUserId: string;
  beforeFinalScore: number;
  beforeReasonSummary: string | null;
  beforeMatchInsightsChecksum: string | null;
  beforeMatchInsightsSummaryJson: unknown;
  beforeUpdatedAt: Date | null;
  baselineFingerprint: string;
  proposedCandidateUserId: string;
  proposedFinalScore: number;
  proposedReasonSummary: string | null;
  proposedSourceVersion: string | null;
  rollbackTokenHash: string | null;
  rolledBack: boolean;
  promotionStatus: string;
  applyAuditRunId: string | null;
};

export type P76CanonicalApplyMatchResultRow = {
  id: string;
  userId: string;
  candidateUserId: string;
  finalScore: number | null;
  reasonSummary: string | null;
  matchInsights: unknown;
  updatedAt: Date;
};

export type P76CanonicalApplyPrisma = {
  $transaction: <T>(fn: (tx: P76CanonicalApplyPrismaTx) => Promise<T>) => Promise<T>;
  p76CanonicalMatchResultMeta: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<P76CanonicalApplySidecarRow | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  p76CanonicalApplyRollbackSnapshot: {
    findUnique: (args: {
      where: { snapshotId: string };
    }) => Promise<P76CanonicalApplySnapshotRow | null>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  matchResult: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<P76CanonicalApplyMatchResultRow | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
};

export type P76CanonicalApplyPrismaTx = Pick<
  P76CanonicalApplyPrisma,
  "p76CanonicalMatchResultMeta" | "p76CanonicalApplyRollbackSnapshot" | "matchResult"
>;
