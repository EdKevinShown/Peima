/**
 * P7.10-r8e — canonical Apply rollback service (hard-disabled; token-gated; no HTTP route).
 */

import { readP76CanonicalRollbackEnv } from "./p76-canonical-rollback-env";
import {
  hashP76CanonicalRollbackTokenV1,
  verifyP76CanonicalRollbackTokenV1,
} from "./p76-canonical-rollback-token";
import type {
  P76CanonicalRollbackBlockedReason,
  P76CanonicalRollbackEnvV1,
  P76CanonicalRollbackGateContextV1,
  P76CanonicalRollbackInputV1,
  P76CanonicalRollbackMatchResultRow,
  P76CanonicalRollbackPrisma,
  P76CanonicalRollbackResultV1,
  P76CanonicalRollbackSafetyV1,
  P76CanonicalRollbackSidecarRow,
  P76CanonicalRollbackSnapshotRow,
  P76CanonicalRollbackStateSnapshotV1,
} from "./p76-canonical-rollback.types";
import {
  P76_CANONICAL_ROLLBACK_GATE12_PASS,
  P76_CANONICAL_ROLLBACK_GRAFANA_PASS,
  P76_CANONICAL_ROLLBACK_SERVICE_SCHEMA_VERSION,
  P76_CANONICAL_ROLLBACK_SERVICE_SOURCE_TYPE,
  P76_CANONICAL_ROLLBACK_SERVICE_SOURCE_VERSION,
} from "./p76-canonical-rollback.types";

const BLOCKED_SAFETY: P76CanonicalRollbackSafetyV1 = {
  writesDb: false,
  writesMatchResult: false,
  restoresFinalScore: false,
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

function mrState(mr: P76CanonicalRollbackMatchResultRow): P76CanonicalRollbackStateSnapshotV1 {
  return {
    candidateUserId: mr.candidateUserId,
    finalScore: mr.finalScore,
    reasonSummary: mr.reasonSummary,
  };
}

function buildBlockedResult(
  input: P76CanonicalRollbackInputV1,
  blockedReasons: P76CanonicalRollbackBlockedReason[],
  partial?: {
    matchResultId?: string | null;
    before?: P76CanonicalRollbackStateSnapshotV1 | null;
  },
): P76CanonicalRollbackResultV1 {
  return {
    schemaVersion: P76_CANONICAL_ROLLBACK_SERVICE_SCHEMA_VERSION,
    sourceType: P76_CANONICAL_ROLLBACK_SERVICE_SOURCE_TYPE,
    sourceVersion: P76_CANONICAL_ROLLBACK_SERVICE_SOURCE_VERSION,
    mode: "blocked",
    rolledBack: false,
    blockedReasons,
    sidecarId: input.sidecarId,
    snapshotId: input.snapshotId,
    matchResultId: partial?.matchResultId ?? input.matchResultId ?? null,
    before: partial?.before ?? null,
    restored: null,
    safety: { ...BLOCKED_SAFETY },
    audit: {
      requestedBy: input.requestedBy,
      rolledBackAt: null,
      rollbackAuditRunId: null,
      auditLogWritten: false,
      tokenVerified: false,
    },
  };
}

function evaluateEnvGates(
  rollbackEnv: P76CanonicalRollbackEnvV1,
  input: P76CanonicalRollbackInputV1,
): P76CanonicalRollbackBlockedReason[] {
  const blocked: P76CanonicalRollbackBlockedReason[] = [];
  if (!rollbackEnv.executionEnabled) blocked.push("rollback_execution_disabled");
  if (!rollbackEnv.allowDbWrite) blocked.push("rollback_db_write_disabled");
  if (!rollbackEnv.requireToken) blocked.push("rollback_token_required");
  if (!input.rollbackTokenPlaintext?.trim()) blocked.push("rollback_token_missing");
  if (rollbackEnv.productionBlocked) blocked.push("production_environment_blocked");
  const env = input.environment.trim().toLowerCase();
  if (
    env === "production" ||
    env === "prod" ||
    env === "customer_production"
  ) {
    blocked.push("production_environment_blocked");
  }
  if (!rollbackEnv.rollbackEnvironmentAllowed) {
    blocked.push("invalid_rollback_environment");
  }
  if (rollbackEnv.percentEnabled || rollbackEnv.productionPercent > 0) {
    blocked.push("percent_rollout_active");
    blocked.push("rollback_would_mutate_percent");
  }
  return blocked;
}

function evaluateGateContextGates(
  ctx: P76CanonicalRollbackGateContextV1,
): P76CanonicalRollbackBlockedReason[] {
  const blocked: P76CanonicalRollbackBlockedReason[] = [];
  if (ctx.gate12Status !== P76_CANONICAL_ROLLBACK_GATE12_PASS) {
    blocked.push("gate12_not_final");
  }
  if (ctx.grafanaStatus !== P76_CANONICAL_ROLLBACK_GRAFANA_PASS) {
    blocked.push("grafana_not_ready");
  }
  if (!signoffApproved(ctx.pmSignoffStatus)) blocked.push("pm_signoff_missing");
  if (!signoffApproved(ctx.opsSignoffStatus)) blocked.push("ops_signoff_missing");
  if (!signoffEngineeringOk(ctx.engineeringSignoffStatus)) {
    blocked.push("eng_signoff_missing");
  }
  if (ctx.incidentActive) blocked.push("incident_active");
  if (ctx.workerDeployActive) blocked.push("worker_deploy_active");
  if (ctx.percentRolloutActive) {
    blocked.push("percent_rollout_active");
    blocked.push("rollback_would_mutate_percent");
  }
  return blocked;
}

function evaluateSnapshotGates(
  snapshot: P76CanonicalRollbackSnapshotRow | null,
  input: P76CanonicalRollbackInputV1,
  now: Date,
  tokenPepper?: string,
): P76CanonicalRollbackBlockedReason[] {
  if (!snapshot) return ["snapshot_not_found"];
  const blocked: P76CanonicalRollbackBlockedReason[] = [];
  if (snapshot.rolledBack) blocked.push("snapshot_already_rolled_back");
  if (snapshot.promotionStatus !== "applied") {
    blocked.push("snapshot_not_applied");
  }
  if (snapshot.sidecarId !== input.sidecarId) blocked.push("snapshot_mismatch");
  if (snapshot.matchResultId !== input.matchResultId) blocked.push("snapshot_mismatch");
  if (!snapshot.rollbackTokenHash?.trim()) {
    blocked.push("rollback_token_hash_missing");
  }
  if (snapshot.rollbackExpiresAt && snapshot.rollbackExpiresAt.getTime() <= now.getTime()) {
    blocked.push("rollback_token_expired");
  }
  if (snapshot.rollbackUsedAt != null) blocked.push("rollback_token_already_used");
  if (!snapshot.beforeCandidateUserId?.trim()) {
    blocked.push("baseline_restore_payload_missing");
  }
  if (!Number.isFinite(snapshot.beforeFinalScore)) {
    blocked.push("baseline_restore_payload_missing");
  }
  const binding = {
    snapshotId: snapshot.snapshotId,
    matchResultId: snapshot.matchResultId,
    sidecarId: snapshot.sidecarId,
  };
  if (
    snapshot.rollbackTokenHash?.trim() &&
    input.rollbackTokenPlaintext?.trim() &&
    !verifyP76CanonicalRollbackTokenV1(
      input.rollbackTokenPlaintext,
      snapshot.rollbackTokenHash,
      binding,
      tokenPepper,
    )
  ) {
    blocked.push("rollback_token_invalid");
  }
  return blocked;
}

function evaluateSidecarGates(
  sidecar: P76CanonicalRollbackSidecarRow | null,
  input: P76CanonicalRollbackInputV1,
): P76CanonicalRollbackBlockedReason[] {
  if (!sidecar) return ["sidecar_not_found"];
  const blocked: P76CanonicalRollbackBlockedReason[] = [];
  if (sidecar.rolledBack) blocked.push("sidecar_already_rolled_back");
  if (sidecar.promotionStatus !== "promoted") blocked.push("sidecar_not_promoted");
  if (sidecar.appliedToWorkerRanking) blocked.push("sidecar_applied_to_worker_ranking");
  if (sidecar.id !== input.sidecarId) blocked.push("snapshot_mismatch");
  if (sidecar.matchResultId !== input.matchResultId) blocked.push("snapshot_mismatch");
  return blocked;
}

function scoresEqual(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 1e-9;
}

function matchAppliedState(
  mr: P76CanonicalRollbackMatchResultRow,
  snapshot: P76CanonicalRollbackSnapshotRow,
): boolean {
  if (mr.candidateUserId !== snapshot.proposedCandidateUserId) return false;
  if (!scoresEqual(mr.finalScore, snapshot.proposedFinalScore)) return false;
  const mrReason = mr.reasonSummary?.trim() ?? "";
  const proposedReason = snapshot.proposedReasonSummary?.trim() ?? "";
  if (proposedReason && mrReason !== proposedReason) return false;
  return true;
}

function buildRollbackMatchInsightsRestore(
  snapshot: P76CanonicalRollbackSnapshotRow,
): unknown {
  const summary = snapshot.beforeMatchInsightsSummaryJson;
  if (summary == null || typeof summary !== "object") {
    return {
      p76CanonicalRollbackMeta: {
        restoredFromSnapshotId: snapshot.snapshotId,
        restoreSource: P76_CANONICAL_ROLLBACK_SERVICE_SOURCE_VERSION,
      },
    };
  }
  return {
    ...(summary as Record<string, unknown>),
    p76CanonicalRollbackMeta: {
      restoredFromSnapshotId: snapshot.snapshotId,
      restoreSource: P76_CANONICAL_ROLLBACK_SERVICE_SOURCE_VERSION,
    },
  };
}

/**
 * Roll back canonical Apply for a persisted snapshot row (token-gated).
 * Default env: hard-disabled — no Prisma access.
 */
export async function rollbackP76CanonicalApply(
  deps: { prisma: P76CanonicalRollbackPrisma },
  input: P76CanonicalRollbackInputV1,
  options?: { rollbackEnv?: P76CanonicalRollbackEnvV1; tokenPepper?: string },
): Promise<P76CanonicalRollbackResultV1> {
  const rollbackEnv = options?.rollbackEnv ?? readP76CanonicalRollbackEnv();
  const envBlocked = evaluateEnvGates(rollbackEnv, input);
  if (envBlocked.length > 0) {
    return buildBlockedResult(input, envBlocked);
  }

  const ctxBlocked = evaluateGateContextGates(input.gateContext);
  if (ctxBlocked.length > 0) {
    return buildBlockedResult(input, ctxBlocked);
  }

  const now = input.now instanceof Date ? input.now : new Date(toIso(input.now));

  const snapshot = await deps.prisma.p76CanonicalApplyRollbackSnapshot.findUnique({
    where: { snapshotId: input.snapshotId },
  });
  const snapshotBlocked = evaluateSnapshotGates(
    snapshot,
    input,
    now,
    options?.tokenPepper,
  );
  if (snapshotBlocked.length > 0) {
    return buildBlockedResult(input, snapshotBlocked, {
      matchResultId: input.matchResultId,
    });
  }

  const sidecar = await deps.prisma.p76CanonicalMatchResultMeta.findUnique({
    where: { id: input.sidecarId },
  });
  const sidecarBlocked = evaluateSidecarGates(sidecar, input);
  if (sidecarBlocked.length > 0) {
    return buildBlockedResult(input, sidecarBlocked, {
      matchResultId: input.matchResultId,
    });
  }

  const mr = await deps.prisma.matchResult.findUnique({
    where: { id: input.matchResultId },
  });
  if (!mr) {
    return buildBlockedResult(input, ["match_result_not_found"], {
      matchResultId: input.matchResultId,
    });
  }

  if (!matchAppliedState(mr, snapshot!)) {
    return buildBlockedResult(input, ["current_match_result_not_matching_applied_state"], {
      matchResultId: mr.id,
      before: mrState(mr),
    });
  }

  const beforeApplied = mrState(mr);
  const restoreCandidate = snapshot!.beforeCandidateUserId;
  const restoreScore = snapshot!.beforeFinalScore;
  const restoreReason = snapshot!.beforeReasonSummary;
  const restoresFinalScore = !scoresEqual(mr.finalScore, restoreScore);
  const rollbackAuditRunId =
    snapshot!.applyAuditRunId ?? sidecar!.auditRunId ?? `rollback-${snapshot!.snapshotId}`;
  const rolledBackAt = toIso(input.now);

  await deps.prisma.$transaction(async (tx) => {
    await tx.matchResult.update({
      where: { id: mr.id },
      data: {
        candidateUserId: restoreCandidate,
        finalScore: restoreScore,
        reasonSummary: restoreReason,
        matchInsights: buildRollbackMatchInsightsRestore(snapshot!),
      },
    });

    await tx.p76CanonicalMatchResultMeta.update({
      where: { id: sidecar!.id },
      data: {
        promotionStatus: "rolled_back",
        rolledBack: true,
        appliedToMatchResult: false,
        appliedToFinalScore: false,
        appliedToWorkerRanking: false,
      },
    });

    await tx.p76CanonicalApplyRollbackSnapshot.update({
      where: { id: snapshot!.id },
      data: {
        promotionStatus: "rollback_completed",
        rolledBack: true,
        rolledBackAt: new Date(rolledBackAt),
        rollbackUsedAt: new Date(rolledBackAt),
        rollbackReason: "p76_canonical_rollback_v1",
        appliedBy: input.requestedBy,
      },
    });
  });

  const restored: P76CanonicalRollbackStateSnapshotV1 = {
    candidateUserId: restoreCandidate,
    finalScore: restoreScore,
    reasonSummary: restoreReason,
  };

  return {
    schemaVersion: P76_CANONICAL_ROLLBACK_SERVICE_SCHEMA_VERSION,
    sourceType: P76_CANONICAL_ROLLBACK_SERVICE_SOURCE_TYPE,
    sourceVersion: P76_CANONICAL_ROLLBACK_SERVICE_SOURCE_VERSION,
    mode: "rolled_back",
    rolledBack: true,
    blockedReasons: [],
    sidecarId: input.sidecarId,
    snapshotId: input.snapshotId,
    matchResultId: mr.id,
    before: beforeApplied,
    restored,
    safety: {
      writesDb: true,
      writesMatchResult: true,
      restoresFinalScore,
      triggersWorker: false,
      changesPercent: false,
      productionRollout: false,
    },
    audit: {
      requestedBy: input.requestedBy,
      rolledBackAt,
      rollbackAuditRunId,
      auditLogWritten: false,
      tokenVerified: true,
    },
  };
}

/** Test helper: derive stored hash for mock fixtures. */
export function deriveP76CanonicalRollbackTokenHashForTests(
  tokenPlaintext: string,
  binding: { snapshotId: string; matchResultId: string; sidecarId: string },
  pepper = "test-pepper-r8e",
): string {
  return hashP76CanonicalRollbackTokenV1(tokenPlaintext, binding, pepper);
}
