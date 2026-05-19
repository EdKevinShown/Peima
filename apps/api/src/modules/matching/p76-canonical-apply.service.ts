/**
 * P7.10-r8d — canonical Apply service (hard-disabled by default; no HTTP route in this milestone).
 */

import {
  computeP76BaselineFingerprintV1,
  summarizeP76MatchInsightsForRollbackSnapshot,
} from "./p76-canonical-apply-rollback-snapshot-builder";
import { readP76CanonicalApplyEnv } from "./p76-canonical-apply-env";
import type {
  P76CanonicalApplyBlockedReason,
  P76CanonicalApplyEnvV1,
  P76CanonicalApplyGateContextV1,
  P76CanonicalApplyInputV1,
  P76CanonicalApplyMatchResultRow,
  P76CanonicalApplyPrisma,
  P76CanonicalApplyResultV1,
  P76CanonicalApplySafetyV1,
  P76CanonicalApplySidecarRow,
  P76CanonicalApplySnapshotRow,
  P76CanonicalApplyStateSnapshotV1,
} from "./p76-canonical-apply.types";
import {
  P76_CANONICAL_APPLY_GATE12_PASS,
  P76_CANONICAL_APPLY_GRAFANA_PASS,
  P76_CANONICAL_APPLY_SERVICE_SCHEMA_VERSION,
  P76_CANONICAL_APPLY_SERVICE_SOURCE_TYPE,
  P76_CANONICAL_APPLY_SERVICE_SOURCE_VERSION,
} from "./p76-canonical-apply.types";

const BLOCKED_SAFETY: P76CanonicalApplySafetyV1 = {
  writesDb: false,
  writesMatchResult: false,
  writesFinalScore: false,
  triggersWorker: false,
  changesPercent: false,
  productionRollout: false,
};

function toIso(value: string | Date | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value.trim();
  return new Date().toISOString();
}

function signoffApproved(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "approved";
}

function signoffEngineeringOk(status: string | null | undefined): boolean {
  const v = (status ?? "").trim().toLowerCase();
  return v === "approved" || v === "not_required";
}

function buildBlockedResult(
  input: P76CanonicalApplyInputV1,
  blockedReasons: P76CanonicalApplyBlockedReason[],
  partial?: {
    matchResultId?: string | null;
    before?: P76CanonicalApplyStateSnapshotV1 | null;
  },
): P76CanonicalApplyResultV1 {
  return {
    schemaVersion: P76_CANONICAL_APPLY_SERVICE_SCHEMA_VERSION,
    sourceType: P76_CANONICAL_APPLY_SERVICE_SOURCE_TYPE,
    sourceVersion: P76_CANONICAL_APPLY_SERVICE_SOURCE_VERSION,
    mode: "blocked",
    applied: false,
    blockedReasons,
    sidecarId: input.sidecarId,
    snapshotId: input.snapshotId,
    matchResultId: partial?.matchResultId ?? null,
    before: partial?.before ?? null,
    after: null,
    safety: { ...BLOCKED_SAFETY },
    audit: {
      requestedBy: input.requestedBy,
      appliedAt: null,
      applyAuditRunId: null,
      auditLogWritten: false,
    },
  };
}

function evaluateEnvGates(
  applyEnv: P76CanonicalApplyEnvV1,
  inputEnvironment: string,
): P76CanonicalApplyBlockedReason[] {
  const blocked: P76CanonicalApplyBlockedReason[] = [];
  if (!applyEnv.executionEnabled) blocked.push("apply_execution_disabled");
  if (!applyEnv.allowDbWrite) blocked.push("apply_db_write_disabled");
  if (applyEnv.productionBlocked) blocked.push("production_environment_blocked");
  const env = inputEnvironment.trim().toLowerCase();
  if (
    env === "production" ||
    env === "prod" ||
    env === "customer_production"
  ) {
    blocked.push("production_environment_blocked");
  }
  if (!applyEnv.applyEnvironmentAllowed) blocked.push("invalid_apply_environment");
  if (applyEnv.percentEnabled || applyEnv.productionPercent > 0) {
    blocked.push("percent_rollout_active");
  }
  return blocked;
}

function evaluateGateContextGates(
  ctx: P76CanonicalApplyGateContextV1,
): P76CanonicalApplyBlockedReason[] {
  const blocked: P76CanonicalApplyBlockedReason[] = [];
  if (ctx.gate12Status !== P76_CANONICAL_APPLY_GATE12_PASS) {
    blocked.push("gate12_not_final");
  }
  if (ctx.grafanaStatus !== P76_CANONICAL_APPLY_GRAFANA_PASS) {
    blocked.push("grafana_not_ready");
  }
  if (!signoffApproved(ctx.pmSignoffStatus)) blocked.push("pm_signoff_missing");
  if (!signoffApproved(ctx.opsSignoffStatus)) blocked.push("ops_signoff_missing");
  if (!signoffEngineeringOk(ctx.engineeringSignoffStatus)) {
    blocked.push("engineering_signoff_missing");
  }
  if (ctx.incidentActive) blocked.push("incident_active");
  if (ctx.workerDeployActive) blocked.push("worker_deploy_active");
  if (ctx.percentRolloutActive) blocked.push("percent_rollout_active");
  return blocked;
}

function evaluateSidecarGates(
  sidecar: P76CanonicalApplySidecarRow | null,
): P76CanonicalApplyBlockedReason[] {
  if (!sidecar) return ["sidecar_not_found"];
  const blocked: P76CanonicalApplyBlockedReason[] = [];
  if (sidecar.deletedAt != null) blocked.push("sidecar_deleted");
  if (sidecar.supersededAt != null) blocked.push("sidecar_superseded");
  if (sidecar.rolledBack) blocked.push("sidecar_rolled_back");
  if (sidecar.promotionStatus === "promoted") blocked.push("already_promoted");
  if (sidecar.appliedToMatchResult) blocked.push("sidecar_applied_to_match_result");
  if (sidecar.appliedToFinalScore) blocked.push("sidecar_applied_to_final_score");
  if (sidecar.appliedToWorkerRanking) blocked.push("sidecar_applied_to_worker_ranking");
  return blocked;
}

function evaluateSnapshotGates(
  snapshot: P76CanonicalApplySnapshotRow | null,
  input: P76CanonicalApplyInputV1,
  sidecar: P76CanonicalApplySidecarRow,
): P76CanonicalApplyBlockedReason[] {
  if (!snapshot) return ["snapshot_not_found"];
  const blocked: P76CanonicalApplyBlockedReason[] = [];
  if (snapshot.rolledBack) blocked.push("snapshot_already_rolled_back");
  if (snapshot.sidecarId !== input.sidecarId || snapshot.sidecarId !== sidecar.id) {
    blocked.push("snapshot_mismatch");
  }
  if (snapshot.matchResultId !== sidecar.matchResultId) {
    blocked.push("snapshot_mismatch");
  }
  if (!snapshot.rollbackTokenHash?.trim()) {
    blocked.push("rollback_token_hash_missing");
  }
  if (snapshot.proposedCandidateUserId !== sidecar.selectedCandidateId) {
    blocked.push("proposal_mismatch");
  }
  const sidecarScore =
    sidecar.score != null && Number.isFinite(sidecar.score) ? sidecar.score : null;
  if (
    sidecarScore != null &&
    Number.isFinite(snapshot.proposedFinalScore) &&
    snapshot.proposedFinalScore !== sidecarScore
  ) {
    blocked.push("proposal_mismatch");
  }
  return blocked;
}

function liveBaselineFingerprint(mr: P76CanonicalApplyMatchResultRow): string {
  const summary = summarizeP76MatchInsightsForRollbackSnapshot(mr.matchInsights);
  return computeP76BaselineFingerprintV1({
    matchResultId: mr.id,
    viewerUserId: mr.userId,
    candidateUserId: mr.candidateUserId,
    finalScore: mr.finalScore,
    reasonSummary: mr.reasonSummary,
    matchInsightsSummary: summary,
    updatedAt: mr.updatedAt.toISOString(),
  });
}

function mrState(mr: P76CanonicalApplyMatchResultRow): P76CanonicalApplyStateSnapshotV1 {
  return {
    candidateUserId: mr.candidateUserId,
    finalScore: mr.finalScore,
    reasonSummary: mr.reasonSummary,
  };
}

/**
 * Apply canonical sidecar proposal to MatchResult when all env + ops gates pass.
 * Default env: hard-disabled — returns blocked without Prisma access.
 */
export async function applyP76CanonicalSidecarToMatchResult(
  deps: { prisma: P76CanonicalApplyPrisma },
  input: P76CanonicalApplyInputV1,
  options?: { applyEnv?: P76CanonicalApplyEnvV1 },
): Promise<P76CanonicalApplyResultV1> {
  const applyEnv = options?.applyEnv ?? readP76CanonicalApplyEnv();
  const envBlocked = evaluateEnvGates(applyEnv, input.environment);
  if (envBlocked.length > 0) {
    return buildBlockedResult(input, envBlocked);
  }

  const ctxBlocked = evaluateGateContextGates(input.gateContext);
  if (ctxBlocked.length > 0) {
    return buildBlockedResult(input, ctxBlocked);
  }

  const sidecar = await deps.prisma.p76CanonicalMatchResultMeta.findUnique({
    where: { id: input.sidecarId },
  });
  const sidecarBlocked = evaluateSidecarGates(sidecar);
  if (sidecarBlocked.length > 0) {
    return buildBlockedResult(input, sidecarBlocked);
  }

  const snapshot = await deps.prisma.p76CanonicalApplyRollbackSnapshot.findUnique({
    where: { snapshotId: input.snapshotId },
  });
  const snapshotBlocked = evaluateSnapshotGates(snapshot, input, sidecar!);
  if (snapshotBlocked.length > 0) {
    return buildBlockedResult(input, snapshotBlocked, {
      matchResultId: sidecar!.matchResultId,
    });
  }

  const matchResultId = sidecar!.matchResultId ?? snapshot!.matchResultId;
  const mr = await deps.prisma.matchResult.findUnique({
    where: { id: matchResultId },
  });
  if (!mr) {
    return buildBlockedResult(input, ["match_result_not_found"], {
      matchResultId,
    });
  }

  if (mr.userId !== sidecar!.viewerUserId || mr.userId !== snapshot!.viewerUserId) {
    return buildBlockedResult(input, ["viewer_mismatch"], {
      matchResultId,
      before: mrState(mr),
    });
  }

  const liveFingerprint = liveBaselineFingerprint(mr);
  if (liveFingerprint !== snapshot!.baselineFingerprint) {
    return buildBlockedResult(input, ["baseline_fingerprint_mismatch"], {
      matchResultId,
      before: mrState(mr),
    });
  }

  const before = mrState(mr);
  const targetCandidate = sidecar!.selectedCandidateId;
  const targetScore =
    sidecar!.score != null && Number.isFinite(sidecar!.score)
      ? sidecar!.score
      : mr.finalScore;
  const scoreWouldChange =
    targetScore != null &&
    mr.finalScore != null &&
    Number.isFinite(mr.finalScore) &&
    targetScore !== mr.finalScore;
  const targetReason =
    sidecar!.reasonSummary?.trim() || mr.reasonSummary;

  const appliedAt = toIso(input.now);

  await deps.prisma.$transaction(async (tx) => {
    await tx.matchResult.update({
      where: { id: mr.id },
      data: {
        candidateUserId: targetCandidate,
        ...(scoreWouldChange ? { finalScore: targetScore } : {}),
        ...(targetReason !== mr.reasonSummary ? { reasonSummary: targetReason } : {}),
      },
    });

    await tx.p76CanonicalMatchResultMeta.update({
      where: { id: sidecar!.id },
      data: {
        promotionStatus: "promoted",
        appliedToMatchResult: true,
        appliedToFinalScore: scoreWouldChange,
        appliedToWorkerRanking: false,
        promotionTargetMatchResultId: mr.id,
        previousSnapshotHash: snapshot!.baselineFingerprint,
      },
    });

    await tx.p76CanonicalApplyRollbackSnapshot.update({
      where: { id: snapshot!.id },
      data: {
        promotionStatus: "applied",
        appliedBy: input.requestedBy,
        applyAuditRunId: snapshot!.applyAuditRunId ?? sidecar!.auditRunId,
      },
    });
  });

  const after: P76CanonicalApplyStateSnapshotV1 = {
    candidateUserId: targetCandidate,
    finalScore: scoreWouldChange ? targetScore : mr.finalScore,
    reasonSummary: targetReason,
  };

  return {
    schemaVersion: P76_CANONICAL_APPLY_SERVICE_SCHEMA_VERSION,
    sourceType: P76_CANONICAL_APPLY_SERVICE_SOURCE_TYPE,
    sourceVersion: P76_CANONICAL_APPLY_SERVICE_SOURCE_VERSION,
    mode: "applied",
    applied: true,
    blockedReasons: [],
    sidecarId: input.sidecarId,
    snapshotId: input.snapshotId,
    matchResultId: mr.id,
    before,
    after,
    safety: {
      writesDb: true,
      writesMatchResult: true,
      writesFinalScore: scoreWouldChange,
      triggersWorker: false,
      changesPercent: false,
      productionRollout: false,
    },
    audit: {
      requestedBy: input.requestedBy,
      appliedAt,
      applyAuditRunId: snapshot!.applyAuditRunId ?? sidecar!.auditRunId,
      auditLogWritten: false,
    },
  };
}
