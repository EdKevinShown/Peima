/**
 * P7.10-r7g — pure rollback snapshot dry-run builder (no DB / MatchResult writes).
 */

import { createHash } from "node:crypto";
import { P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_FORBIDDEN_JSON_KEYS } from "./p76-canonical-match-result-sidecar-writer-privacy";
import type {
  P76CanonicalApplyRollbackSnapshotBlockedReason,
  P76CanonicalApplyRollbackSnapshotBuildInputV1,
  P76CanonicalApplyRollbackSnapshotV1,
  P76MatchInsightsSummaryV1,
} from "./p76-canonical-apply-rollback-snapshot.types";
import {
  P76_CANONICAL_APPLY_ROLLBACK_SCOPE,
  P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_DEFAULT_TTL_HOURS_DEV,
  P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_DEFAULT_TTL_HOURS_PROD_LIKE,
  P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SCHEMA_VERSION,
  P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_TYPE,
  P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_VERSION,
} from "./p76-canonical-apply-rollback-snapshot.types";

const FORBIDDEN_KEY_SET = new Set<string>(
  P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_FORBIDDEN_JSON_KEYS as readonly string[],
);

const SNAPSHOT_SAFETY = {
  writesDb: false,
  writesMatchResult: false,
  writesFinalScore: false,
  triggersWorker: false,
  changesPercent: false,
  productionRollout: false,
} as const;

function normalizeId(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function isTimestampSet(value: string | Date | null | undefined): boolean {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return String(value).trim().length > 0;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!isTimestampSet(value)) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function isProductionLikeEnvironment(environment: string): boolean {
  const env = environment.trim().toLowerCase();
  return env === "production" || env === "prod" || env === "customer_production";
}

function sortKeysDeep(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const obj = value as Record<string, unknown>;
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortKeysDeep(obj[key]);
      return acc;
    }, {});
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function stripForbiddenKeys(
  value: unknown,
  stripped: string[],
): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripForbiddenKeys(item, stripped));
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY_SET.has(key)) {
      stripped.push(key);
      continue;
    }
    out[key] = stripForbiddenKeys(child, stripped);
  }
  return out;
}

export function summarizeP76MatchInsightsForRollbackSnapshot(
  matchInsights: unknown,
): P76MatchInsightsSummaryV1 | null {
  if (matchInsights == null) return null;
  const stripped: string[] = [];
  const sanitized = stripForbiddenKeys(matchInsights, stripped);
  const hasMatchInsights =
    typeof sanitized === "object" &&
    sanitized != null &&
    !Array.isArray(sanitized) &&
    Object.keys(sanitized as object).length > 0;

  if (!hasMatchInsights && stripped.length === 0) {
    return {
      hasMatchInsights: false,
      topLevelKeys: [],
      checksum: sha256Hex("null"),
      hasP76CanonicalWriterMeta: false,
      schemaVersion: null,
      forbiddenKeysStripped: [],
    };
  }

  const topLevelKeys =
    typeof sanitized === "object" && sanitized != null && !Array.isArray(sanitized)
      ? Object.keys(sanitized as object).sort()
      : [];

  const schemaVersion =
    typeof sanitized === "object" &&
    sanitized != null &&
    !Array.isArray(sanitized) &&
    typeof (sanitized as { version?: unknown }).version === "number"
      ? ((sanitized as { version: number }).version as number)
      : null;

  const hasP76CanonicalWriterMeta = topLevelKeys.some(
    (k) => k === "p76CanonicalWriterMeta" || k === "canonicalWriterMeta",
  );

  return {
    hasMatchInsights,
    topLevelKeys,
    checksum: sha256Hex(canonicalJson(sanitized)),
    hasP76CanonicalWriterMeta,
    schemaVersion,
    forbiddenKeysStripped: [...new Set(stripped)].sort(),
  };
}

export function computeP76BaselineFingerprintV1(args: {
  matchResultId: string;
  viewerUserId: string;
  candidateUserId: string | null;
  finalScore: number | null;
  reasonSummary: string | null;
  matchInsightsSummary: P76MatchInsightsSummaryV1 | null;
  updatedAt: string | null;
}): string {
  const slice = {
    matchResultId: args.matchResultId,
    viewerUserId: args.viewerUserId,
    candidateUserId: args.candidateUserId,
    finalScore: args.finalScore,
    reasonSummary: args.reasonSummary,
    matchInsightsChecksum: args.matchInsightsSummary?.checksum ?? null,
    updatedAt: args.updatedAt,
  };
  return sha256Hex(canonicalJson(slice));
}

export function evaluateP76CanonicalApplyRollbackSnapshotGuards(
  input: P76CanonicalApplyRollbackSnapshotBuildInputV1,
): P76CanonicalApplyRollbackSnapshotBlockedReason[] {
  const blocked: P76CanonicalApplyRollbackSnapshotBlockedReason[] = [];
  const sidecar = input.sidecar;

  if (!sidecar) {
    blocked.push("missing_sidecar");
    return blocked;
  }

  if (!normalizeId(sidecar.id)) {
    blocked.push("missing_sidecar_id");
  }

  const mr = input.currentMatchResult;
  if (!mr || !normalizeId(mr.id)) {
    blocked.push("missing_current_match_result");
  }

  const viewerSidecar = normalizeId(sidecar.viewerUserId);
  const viewerMr = normalizeId(mr?.viewerUserId);
  if (
    viewerSidecar &&
    viewerMr &&
    viewerSidecar !== viewerMr
  ) {
    blocked.push("viewer_mismatch");
  }

  if (!normalizeId(sidecar.selectedCandidateId)) {
    blocked.push("missing_selected_candidate");
  }

  if (!input.previewPayload.canApply) {
    blocked.push("preview_not_ready");
  }

  if ((sidecar.promotionStatus ?? "").trim().toLowerCase() === "promoted") {
    blocked.push("sidecar_already_promoted");
  }

  if (sidecar.rolledBack === true) {
    blocked.push("sidecar_rolled_back");
  }

  if (isTimestampSet(sidecar.deletedAt)) {
    blocked.push("sidecar_deleted");
  }

  if (isTimestampSet(sidecar.supersededAt)) {
    blocked.push("sidecar_superseded");
  }

  if (sidecar.appliedToWorkerRanking === true) {
    blocked.push("sidecar_applied_to_worker_ranking");
  }

  if (sidecar.appliedToMatchResult === true) {
    blocked.push("sidecar_applied_to_match_result");
  }

  if (sidecar.appliedToFinalScore === true) {
    blocked.push("sidecar_applied_to_final_score");
  }

  return blocked;
}

function resolveRollbackTtlHours(
  input: P76CanonicalApplyRollbackSnapshotBuildInputV1,
  environment: string,
): number {
  if (
    input.rollbackTtlHours != null &&
    Number.isFinite(input.rollbackTtlHours) &&
    input.rollbackTtlHours > 0
  ) {
    return input.rollbackTtlHours;
  }
  return isProductionLikeEnvironment(environment)
    ? P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_DEFAULT_TTL_HOURS_PROD_LIKE
    : P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_DEFAULT_TTL_HOURS_DEV;
}

function resolveCapturedAt(input: P76CanonicalApplyRollbackSnapshotBuildInputV1): string {
  if (input.now instanceof Date) return input.now.toISOString();
  if (typeof input.now === "string" && input.now.trim()) {
    return input.now.trim();
  }
  return new Date().toISOString();
}

export function assertP76CanonicalRollbackSnapshotNeverWrites(
  snapshot: Pick<P76CanonicalApplyRollbackSnapshotV1, "mode" | "safety">,
): void {
  if (snapshot.mode !== "dry_run") {
    throw new Error("P7.10-r7g invariant: rollback snapshot mode must be dry_run");
  }
  const { safety } = snapshot;
  if (safety.writesDb !== false) {
    throw new Error("P7.10-r7g invariant: snapshot must not write DB");
  }
  if (safety.writesMatchResult !== false) {
    throw new Error("P7.10-r7g invariant: snapshot must not write MatchResult");
  }
  if (safety.writesFinalScore !== false) {
    throw new Error("P7.10-r7g invariant: snapshot must not write finalScore");
  }
  if (safety.triggersWorker !== false) {
    throw new Error("P7.10-r7g invariant: snapshot must not trigger worker");
  }
  if (safety.changesPercent !== false) {
    throw new Error("P7.10-r7g invariant: snapshot must not change percent");
  }
  if (safety.productionRollout !== false) {
    throw new Error("P7.10-r7g invariant: snapshot must not enable production rollout");
  }
}

export function buildP76CanonicalApplyRollbackSnapshotV1(
  input: P76CanonicalApplyRollbackSnapshotBuildInputV1,
): P76CanonicalApplyRollbackSnapshotV1 {
  const guardBlocked = evaluateP76CanonicalApplyRollbackSnapshotGuards(input);
  const blockedReasons = [...guardBlocked];

  const sidecar = input.sidecar;
  const mr = input.currentMatchResult;
  const environment =
    input.environment?.trim() ||
    sidecar?.environment?.trim() ||
    "dev";

  const capturedAt = resolveCapturedAt(input);
  const sidecarId = normalizeId(sidecar?.id) || "unknown-sidecar";
  const matchResultId =
    normalizeId(mr?.id) || normalizeId(sidecar?.matchResultId) || "unknown-match-result";
  const viewerUserId =
    normalizeId(sidecar?.viewerUserId) || normalizeId(mr?.viewerUserId) || "unknown-viewer";

  const snapshotId =
    input.snapshotId?.trim() ||
    `dry-run-${sidecarId}-${matchResultId}`;

  const matchInsightsSummary = mr?.matchInsights != null
    ? summarizeP76MatchInsightsForRollbackSnapshot(mr.matchInsights)
    : null;

  const updatedAt = toIso(mr?.updatedAt) ?? capturedAt;
  const beforeCandidate = mr?.candidateUserId != null
    ? normalizeId(mr.candidateUserId) || null
    : null;
  const beforeScore =
    mr?.finalScore != null && Number.isFinite(mr.finalScore) ? mr.finalScore : null;
  const beforeReason = mr?.reasonSummary?.trim() || null;

  const baselineFingerprint =
    mr && normalizeId(mr.id)
      ? computeP76BaselineFingerprintV1({
          matchResultId: mr.id,
          viewerUserId: normalizeId(mr.viewerUserId),
          candidateUserId: beforeCandidate,
          finalScore: beforeScore,
          reasonSummary: beforeReason,
          matchInsightsSummary,
          updatedAt,
        })
      : null;

  const ttlHours = resolveRollbackTtlHours(input, environment);
  const expiresMs = new Date(capturedAt).getTime() + ttlHours * 60 * 60 * 1000;
  const rollbackExpiresAt = Number.isFinite(expiresMs)
    ? new Date(expiresMs).toISOString()
    : null;

  const snapshotReady = blockedReasons.length === 0;

  const snapshot: P76CanonicalApplyRollbackSnapshotV1 = {
    schemaVersion: P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SCHEMA_VERSION,
    sourceType: P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_TYPE,
    sourceVersion: P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_VERSION,
    mode: "dry_run",
    snapshotReady,
    blockedReasons,
    snapshotId,
    viewerUserId,
    matchResultId,
    sidecarId,
    before: {
      candidateUserId: beforeCandidate,
      finalScore: beforeScore,
      reasonSummary: beforeReason,
      matchInsightsSummary,
      updatedAt,
      baselineFingerprint,
    },
    proposedAfter: {
      candidateUserId: normalizeId(sidecar?.selectedCandidateId) || null,
      finalScore:
        sidecar?.score != null && Number.isFinite(sidecar.score) ? sidecar.score : null,
      reasonSummary: sidecar?.reasonSummary?.trim() || null,
      sourceVersion: sidecar?.sourceVersion?.trim() || null,
    },
    rollback: {
      rollbackTokenRequired: true,
      rollbackTokenPreview: "redacted",
      rollbackExpiresAt: snapshotReady ? rollbackExpiresAt : null,
      rollbackScope: P76_CANONICAL_APPLY_ROLLBACK_SCOPE,
      rollbackTokenHash: null,
    },
    approvals: {
      pmSignoffStatus: sidecar?.pmSignoffStatus?.trim() || "not_required",
      opsSignoffStatus: sidecar?.opsSignoffStatus?.trim() || "not_required",
      engineeringSignoffStatus:
        input.approvals?.engineeringSignoffStatus?.trim() || "not_required",
    },
    safety: { ...SNAPSHOT_SAFETY },
    capturedAt,
    capturedBy: input.capturedBy?.trim() || null,
    environment,
  };

  assertP76CanonicalRollbackSnapshotNeverWrites(snapshot);

  if (snapshot.rollback.rollbackTokenHash !== null) {
    throw new Error("P7.10-r7g invariant: rollbackTokenHash must be null in dry-run");
  }

  const payloadKeys = new Set<string>();
  collectJsonPropertyKeys(snapshot, payloadKeys);
  for (const forbiddenKey of FORBIDDEN_KEY_SET) {
    if (payloadKeys.has(forbiddenKey)) {
      throw new Error(
        `P7.10-r7g invariant: snapshot must not contain forbidden property ${forbiddenKey}`,
      );
    }
  }

  return snapshot;
}

function collectJsonPropertyKeys(value: unknown, keys: Set<string>): void {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonPropertyKeys(item, keys);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    keys.add(key);
    collectJsonPropertyKeys(child, keys);
  }
}
