/**
 * P7.10-r8c — persist canonical apply rollback snapshot rows only (no MatchResult / sidecar mutation).
 */

import type { Prisma } from "@peima/database";
import { findP76CanonicalMatchResultSidecarForbiddenKey } from "./p76-canonical-match-result-sidecar-writer-privacy";
import type { P76CanonicalApplyRollbackSnapshotV1 } from "./p76-canonical-apply-rollback-snapshot.types";
import type {
  CreateP76CanonicalApplyRollbackSnapshotRecordInput,
  CreateP76CanonicalApplyRollbackSnapshotRecordResult,
  P76CanonicalApplyRollbackSnapshotPersistencePrisma,
  P76CanonicalApplyRollbackSnapshotPersistedRow,
  P76CanonicalApplyRollbackSnapshotRecordSummary,
} from "./p76-canonical-apply-rollback-snapshot-persistence.types";
import { P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_PERSISTENCE_SOURCE_VERSION } from "./p76-canonical-apply-rollback-snapshot-persistence.types";

const PLAINTEXT_TOKEN_PATTERN =
  /rollbackToken(?!Hash|Preview|Required)|eyJ[A-Za-z0-9_-]{10,}/i;

function assertSnapshotSafetyInvariants(snapshot: P76CanonicalApplyRollbackSnapshotV1): string | null {
  const { safety, rollback } = snapshot;
  if (!snapshot.snapshotReady) return "snapshot_not_ready";
  if (safety.writesDb !== false) return "safety_writes_db";
  if (safety.writesMatchResult !== false) return "safety_writes_match_result";
  if (safety.writesFinalScore !== false) return "safety_writes_final_score";
  if (safety.triggersWorker !== false) return "safety_triggers_worker";
  if (safety.changesPercent !== false) return "safety_changes_percent";
  if (safety.productionRollout !== false) return "safety_production_rollout";
  if (rollback.rollbackTokenPreview !== "redacted") return "rollback_token_preview_not_redacted";
  return null;
}

function parseOptionalDate(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) {
    throw new Error(`P7.10-r8c: missing required field ${field}`);
  }
  return v;
}

function requireFiniteScore(value: number | null | undefined, field: string): number {
  if (value == null || !Number.isFinite(value)) {
    throw new Error(`P7.10-r8c: missing required score ${field}`);
  }
  return value;
}

function toSummaryJson(
  summary: P76CanonicalApplyRollbackSnapshotV1["before"]["matchInsightsSummary"],
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (summary == null) return undefined;
  const forbidden = findP76CanonicalMatchResultSidecarForbiddenKey(summary);
  if (forbidden) {
    throw new Error(`P7.10-r8c: matchInsights summary contains forbidden key ${forbidden}`);
  }
  return summary as Prisma.InputJsonValue;
}

function mapRowToSummary(
  row: P76CanonicalApplyRollbackSnapshotPersistedRow,
): P76CanonicalApplyRollbackSnapshotRecordSummary {
  return {
    id: row.id,
    snapshotId: row.snapshotId,
    sidecarId: row.sidecarId,
    matchResultId: row.matchResultId,
    viewerUserId: row.viewerUserId,
    baselineFingerprint: row.baselineFingerprint,
    beforeCandidateUserId: row.beforeCandidateUserId,
    beforeFinalScore: row.beforeFinalScore,
    proposedCandidateUserId: row.proposedCandidateUserId,
    proposedFinalScore: row.proposedFinalScore,
    rollbackTokenHash: row.rollbackTokenHash,
    rolledBack: row.rolledBack,
    promotionStatus: row.promotionStatus,
    environment: row.environment,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildCreateData(
  input: CreateP76CanonicalApplyRollbackSnapshotRecordInput,
): Prisma.P76CanonicalApplyRollbackSnapshotCreateInput {
  const snapshot = input.dryRunSnapshot;
  const before = snapshot.before;
  const proposed = snapshot.proposedAfter;

  const beforeCandidateUserId = requireNonEmpty(
    before.candidateUserId,
    "before.candidateUserId",
  );
  const beforeFinalScore = requireFiniteScore(before.finalScore, "before.finalScore");
  const baselineFingerprint = requireNonEmpty(
    before.baselineFingerprint,
    "before.baselineFingerprint",
  );
  const proposedCandidateUserId = requireNonEmpty(
    proposed.candidateUserId,
    "proposedAfter.candidateUserId",
  );
  const proposedFinalScore = requireFiniteScore(
    proposed.finalScore ?? before.finalScore,
    "proposedAfter.finalScore",
  );

  const summaryJson = toSummaryJson(before.matchInsightsSummary);
  const environment =
    input.environment?.trim() || snapshot.environment.trim() || "dev";

  const data: Prisma.P76CanonicalApplyRollbackSnapshotCreateInput = {
    snapshotId: requireNonEmpty(snapshot.snapshotId, "snapshotId"),
    sidecarId: requireNonEmpty(snapshot.sidecarId, "sidecarId"),
    matchResultId: requireNonEmpty(snapshot.matchResultId, "matchResultId"),
    viewerUserId: requireNonEmpty(snapshot.viewerUserId, "viewerUserId"),
    beforeCandidateUserId,
    beforeFinalScore,
    beforeReasonSummary: before.reasonSummary,
    beforeMatchInsightsChecksum: before.matchInsightsSummary?.checksum ?? null,
    beforeMatchInsightsSummaryJson: summaryJson,
    beforeUpdatedAt: parseOptionalDate(before.updatedAt),
    baselineFingerprint,
    proposedCandidateUserId,
    proposedFinalScore,
    proposedReasonSummary: proposed.reasonSummary,
    proposedSourceVersion: proposed.sourceVersion,
    rollbackTokenHash: input.rollbackTokenHash?.trim() || null,
    rollbackExpiresAt: parseOptionalDate(snapshot.rollback.rollbackExpiresAt),
    rolledBack: false,
    applyAuditRunId: input.auditRunId?.trim() || null,
    appliedBy: input.requestedBy?.trim() || snapshot.capturedBy,
    approvedByPm:
      input.approvals?.pmSignoffStatus?.trim() || snapshot.approvals.pmSignoffStatus,
    approvedByOps:
      input.approvals?.opsSignoffStatus?.trim() || snapshot.approvals.opsSignoffStatus,
    approvedByEngineering:
      input.approvals?.engineeringSignoffStatus?.trim() ||
      snapshot.approvals.engineeringSignoffStatus,
    promotionStatus: "snapshot_created",
    sourceType: snapshot.sourceType,
    sourceVersion: P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_PERSISTENCE_SOURCE_VERSION,
    environment,
  };

  const serialized = JSON.stringify(data);
  if (PLAINTEXT_TOKEN_PATTERN.test(serialized)) {
    throw new Error("P7.10-r8c: create payload must not contain plaintext rollback token");
  }

  return data;
}

/**
 * Persist a rollback snapshot row when r7g dry-run snapshot is ready.
 * Does not mutate MatchResult, sidecar, or worker.
 */
export async function createP76CanonicalApplyRollbackSnapshotRecord(
  deps: { prisma: P76CanonicalApplyRollbackSnapshotPersistencePrisma },
  input: CreateP76CanonicalApplyRollbackSnapshotRecordInput,
): Promise<CreateP76CanonicalApplyRollbackSnapshotRecordResult> {
  const snapshot = input.dryRunSnapshot;

  if (!snapshot.snapshotReady) {
    return {
      ok: false,
      reason: "snapshot_not_ready",
      blockedReasons: [...snapshot.blockedReasons],
    };
  }

  const safetyViolation = assertSnapshotSafetyInvariants(snapshot);
  if (safetyViolation) {
    return {
      ok: false,
      reason: "safety_invariant_violation",
      blockedReasons: [...snapshot.blockedReasons],
    };
  }

  if (snapshot.rollback.rollbackTokenHash !== null) {
    return {
      ok: false,
      reason: "invalid_snapshot_payload",
      blockedReasons: [...snapshot.blockedReasons],
    };
  }

  let data: Prisma.P76CanonicalApplyRollbackSnapshotCreateInput;
  try {
    data = buildCreateData(input);
  } catch {
    return {
      ok: false,
      reason: "invalid_snapshot_payload",
      blockedReasons: [...snapshot.blockedReasons],
    };
  }

  const row = await deps.prisma.p76CanonicalApplyRollbackSnapshot.create({ data });
  return { ok: true, persisted: mapRowToSummary(row) };
}

/** Test helper: ensure prisma deps only expose snapshot create (no MR/sidecar writes). */
export function assertP76CanonicalApplyRollbackSnapshotPersistencePrismaSurfaceSafe(
  prisma: unknown,
): void {
  if (prisma == null || typeof prisma !== "object") {
    throw new Error("P7.10-r8c: prisma deps required");
  }
  const p = prisma as Record<string, unknown>;
  const forbiddenModels = ["matchResult", "p76CanonicalMatchResultMeta"] as const;
  for (const model of forbiddenModels) {
    const delegate = p[model];
    if (delegate != null && typeof delegate === "object") {
      const d = delegate as Record<string, unknown>;
      for (const method of ["update", "upsert", "delete", "create"]) {
        if (typeof d[method] === "function") {
          throw new Error(
            `P7.10-r8c: prisma surface must not expose ${model}.${method} for snapshot persistence`,
          );
        }
      }
    }
  }
}
