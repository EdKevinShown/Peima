/**
 * P7.10-r8e — canonical Apply rollback service types (hard-disabled by default).
 */

export const P76_CANONICAL_ROLLBACK_SERVICE_SCHEMA_VERSION = 1 as const;

export const P76_CANONICAL_ROLLBACK_SERVICE_SOURCE_TYPE =
  "p76_canonical_rollback_service" as const;

export const P76_CANONICAL_ROLLBACK_SERVICE_SOURCE_VERSION =
  "p7.10-r8e-canonical-rollback-service-v1" as const;

export const P76_CANONICAL_ROLLBACK_GATE12_PASS =
  "PASS_GATE12_FOR_R8_CONTROLLED_IMPLEMENTATION" as const;

export const P76_CANONICAL_ROLLBACK_GRAFANA_PASS =
  "PASS_GRAFANA_PHYSICAL_IMPORT_AND_TEST_ALERT" as const;

export type P76CanonicalRollbackBlockedReason =
  | "rollback_execution_disabled"
  | "rollback_db_write_disabled"
  | "rollback_token_required"
  | "rollback_token_missing"
  | "rollback_token_hash_missing"
  | "rollback_token_invalid"
  | "rollback_token_expired"
  | "rollback_token_already_used"
  | "production_environment_blocked"
  | "invalid_rollback_environment"
  | "gate12_not_final"
  | "grafana_not_ready"
  | "pm_signoff_missing"
  | "ops_signoff_missing"
  | "eng_signoff_missing"
  | "incident_active"
  | "worker_deploy_active"
  | "percent_rollout_active"
  | "snapshot_not_found"
  | "snapshot_already_rolled_back"
  | "snapshot_not_applied"
  | "snapshot_mismatch"
  | "sidecar_not_found"
  | "sidecar_not_promoted"
  | "sidecar_already_rolled_back"
  | "sidecar_applied_to_worker_ranking"
  | "match_result_not_found"
  | "current_match_result_not_matching_applied_state"
  | "baseline_restore_payload_missing"
  | "rollback_would_touch_worker_ranking"
  | "rollback_would_mutate_percent";

export type P76CanonicalRollbackGateContextV1 = {
  gate12Status: string;
  grafanaStatus: string;
  pmSignoffStatus: string;
  opsSignoffStatus: string;
  engineeringSignoffStatus: string;
  incidentActive: boolean;
  workerDeployActive: boolean;
  percentRolloutActive: boolean;
};

export type P76CanonicalRollbackEnvV1 = {
  executionEnabled: boolean;
  allowDbWrite: boolean;
  requireToken: boolean;
  configuredEnvironment: string;
  nodeEnv: string;
  productionPercent: number;
  percentEnabled: boolean;
  rollbackEnvironmentAllowed: boolean;
  productionBlocked: boolean;
  canExecute: boolean;
};

export type P76CanonicalRollbackInputV1 = {
  snapshotId: string;
  sidecarId: string;
  matchResultId: string;
  rollbackTokenPlaintext: string | null;
  requestedBy: string;
  environment: string;
  gateContext: P76CanonicalRollbackGateContextV1;
  now?: string | Date;
};

export type P76CanonicalRollbackStateSnapshotV1 = {
  candidateUserId: string | null;
  finalScore: number | null;
  reasonSummary: string | null;
};

export type P76CanonicalRollbackSafetyV1 = {
  writesDb: boolean;
  writesMatchResult: boolean;
  restoresFinalScore: boolean;
  triggersWorker: boolean;
  changesPercent: boolean;
  productionRollout: boolean;
};

export type P76CanonicalRollbackAuditV1 = {
  requestedBy: string;
  rolledBackAt: string | null;
  rollbackAuditRunId: string | null;
  auditLogWritten: boolean;
  tokenVerified: boolean;
};

export type P76CanonicalRollbackResultV1 = {
  schemaVersion: typeof P76_CANONICAL_ROLLBACK_SERVICE_SCHEMA_VERSION;
  sourceType: typeof P76_CANONICAL_ROLLBACK_SERVICE_SOURCE_TYPE;
  sourceVersion: typeof P76_CANONICAL_ROLLBACK_SERVICE_SOURCE_VERSION;
  mode: "blocked" | "rolled_back";
  rolledBack: boolean;
  blockedReasons: P76CanonicalRollbackBlockedReason[];
  sidecarId: string;
  snapshotId: string;
  matchResultId: string | null;
  before: P76CanonicalRollbackStateSnapshotV1 | null;
  restored: P76CanonicalRollbackStateSnapshotV1 | null;
  safety: P76CanonicalRollbackSafetyV1;
  audit: P76CanonicalRollbackAuditV1;
};

export type P76CanonicalRollbackSidecarRow = {
  id: string;
  auditRunId: string;
  environment: string;
  viewerUserId: string;
  matchResultId: string | null;
  selectedCandidateId: string;
  score: number | null;
  reasonSummary: string | null;
  promotionStatus: string;
  appliedToMatchResult: boolean;
  appliedToFinalScore: boolean;
  appliedToWorkerRanking: boolean;
  rolledBack: boolean;
  rolledBackAt: Date | null;
  rolledBackBy: string | null;
  deletedAt: Date | null;
  supersededAt: Date | null;
};

export type P76CanonicalRollbackSnapshotRow = {
  id: string;
  snapshotId: string;
  sidecarId: string;
  matchResultId: string;
  viewerUserId: string;
  beforeCandidateUserId: string;
  beforeFinalScore: number;
  beforeReasonSummary: string | null;
  beforeMatchInsightsSummaryJson: unknown;
  baselineFingerprint: string;
  proposedCandidateUserId: string;
  proposedFinalScore: number;
  proposedReasonSummary: string | null;
  rollbackTokenHash: string | null;
  rollbackExpiresAt: Date | null;
  rollbackUsedAt: Date | null;
  rolledBack: boolean;
  promotionStatus: string;
  applyAuditRunId: string | null;
};

export type P76CanonicalRollbackMatchResultRow = {
  id: string;
  userId: string;
  candidateUserId: string;
  finalScore: number | null;
  reasonSummary: string | null;
  matchInsights: unknown;
  updatedAt: Date;
};

export type P76CanonicalRollbackPrisma = {
  $transaction: <T>(fn: (tx: P76CanonicalRollbackPrismaTx) => Promise<T>) => Promise<T>;
  p76CanonicalMatchResultMeta: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<P76CanonicalRollbackSidecarRow | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  p76CanonicalApplyRollbackSnapshot: {
    findUnique: (args: {
      where: { snapshotId: string };
    }) => Promise<P76CanonicalRollbackSnapshotRow | null>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  matchResult: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<P76CanonicalRollbackMatchResultRow | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
};

export type P76CanonicalRollbackPrismaTx = Pick<
  P76CanonicalRollbackPrisma,
  "p76CanonicalMatchResultMeta" | "p76CanonicalApplyRollbackSnapshot" | "matchResult"
>;
