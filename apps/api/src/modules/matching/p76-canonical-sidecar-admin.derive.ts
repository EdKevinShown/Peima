/**
 * P7.7-r4.1 — derive / aggregate / privacy helpers for canonical sidecar admin API.
 */

import { P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_FORBIDDEN_JSON_KEYS } from "./p76-canonical-match-result-sidecar-writer-privacy";
import type {
  P76CanonicalMatchResultMetaDbRow,
  P76CanonicalSidecarAdminAggregateV1,
  P76CanonicalSidecarAdminDetail,
  P76CanonicalSidecarAdminListItem,
  P76CanonicalSidecarAdminSafetyV1,
} from "./p76-canonical-sidecar-admin.types";
import { P76_CANONICAL_SIDECAR_ADMIN_MAX_LIST_LIMIT } from "./p76-canonical-sidecar-admin.types";

export function normalizeP76CanonicalSidecarAdminListLimit(limit?: number): number {
  const n = limit ?? 50;
  if (n < 1) return 50;
  return Math.min(n, P76_CANONICAL_SIDECAR_ADMIN_MAX_LIST_LIMIT);
}

export function sanitizeP76CanonicalSidecarAdminJson(value: unknown): unknown {
  if (value == null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeP76CanonicalSidecarAdminJson(item));
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_FORBIDDEN_JSON_KEYS.some(
        (deny) => deny.toLowerCase() === key.toLowerCase(),
      )
    ) {
      continue;
    }
    out[key] = sanitizeP76CanonicalSidecarAdminJson(child);
  }
  return out;
}

function isDryRunPayloadBlocked(row: P76CanonicalMatchResultMetaDbRow): boolean {
  if (row.rolledBack) return true;
  const payload = row.dryRunPayload;
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const guardrails = (payload as { guardrails?: { eligible?: boolean } }).guardrails;
  return guardrails?.eligible === false;
}

export function isP76CanonicalSidecarAppliedToMatchResultViolation(
  row: Pick<P76CanonicalMatchResultMetaDbRow, "appliedToMatchResult" | "promotionStatus">,
): boolean {
  return (
    row.appliedToMatchResult === true && row.promotionStatus !== "promoted"
  );
}

export function isP76CanonicalSidecarAppliedToFinalScoreViolation(
  row: Pick<P76CanonicalMatchResultMetaDbRow, "appliedToFinalScore" | "promotionStatus">,
): boolean {
  return row.appliedToFinalScore === true && row.promotionStatus !== "promoted";
}

export function deriveP76CanonicalSidecarAdminSafety(
  row: P76CanonicalMatchResultMetaDbRow,
): P76CanonicalSidecarAdminSafetyV1 {
  return {
    isSidecarOnly: row.mode === "sidecar" && row.promotionStatus === "not_promoted",
    notAppliedToMatchResult: row.appliedToMatchResult === false,
    notAppliedToFinalScore: row.appliedToFinalScore === false,
    notAppliedToWorkerRanking: row.appliedToWorkerRanking === false,
    readByGetPath: false,
    readByWorker: false,
  };
}

export function deriveP76CanonicalSidecarAdminListItem(
  row: P76CanonicalMatchResultMetaDbRow,
): P76CanonicalSidecarAdminListItem {
  return {
    id: row.id,
    auditRunId: row.auditRunId,
    environment: row.environment,
    viewerUserId: row.viewerUserId,
    matchResultId: row.matchResultId,
    selectedCandidateId: row.selectedCandidateId,
    sourceType: row.sourceType,
    sourceVersion: row.sourceVersion,
    schemaVersion: row.schemaVersion,
    mode: row.mode,
    score: row.score,
    promotionStatus: row.promotionStatus,
    appliedToMatchResult: row.appliedToMatchResult,
    appliedToFinalScore: row.appliedToFinalScore,
    appliedToWorkerRanking: row.appliedToWorkerRanking,
    rolledBack: row.rolledBack,
    pmSignoffStatus: row.pmSignoffStatus,
    opsSignoffStatus: row.opsSignoffStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    supersededAt: row.supersededAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    safety: deriveP76CanonicalSidecarAdminSafety(row),
  };
}

export function deriveP76CanonicalSidecarAdminDetail(
  row: P76CanonicalMatchResultMetaDbRow,
): P76CanonicalSidecarAdminDetail {
  const listItem = deriveP76CanonicalSidecarAdminListItem(row);
  return {
    ...listItem,
    reasonSummary: row.reasonSummary,
    stageSummary: sanitizeP76CanonicalSidecarAdminJson(row.stageSummary),
    safeFallbackMeta: sanitizeP76CanonicalSidecarAdminJson(row.safeFallbackMeta),
    guardrails: sanitizeP76CanonicalSidecarAdminJson(row.guardrails),
    dryRunPayload: sanitizeP76CanonicalSidecarAdminJson(row.dryRunPayload),
    promotionTargetMatchResultId: row.promotionTargetMatchResultId,
    rollbackTokenPresent: Boolean(row.rollbackToken?.trim()),
    previousSnapshotHashPresent: Boolean(row.previousSnapshotHash?.trim()),
  };
}

export function computeP76CanonicalSidecarAdminAggregate(
  items: P76CanonicalSidecarAdminListItem[],
  rows: P76CanonicalMatchResultMetaDbRow[],
): P76CanonicalSidecarAdminAggregateV1 {
  const promotionStatusCounts: Record<string, number> = {};
  const modeCounts: Record<string, number> = {};
  const sourceVersionCounts: Record<string, number> = {};
  const environmentCounts: Record<string, number> = {};
  const auditRunSet = new Set<string>();

  let sidecarOnlyCount = 0;
  let promotedCount = 0;
  let blockedCount = 0;
  let rolledBackCount = 0;
  let appliedToMatchResultViolationCount = 0;
  let appliedToFinalScoreViolationCount = 0;
  let appliedToWorkerRankingViolationCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const row = rows[i]!;
    promotionStatusCounts[item.promotionStatus] =
      (promotionStatusCounts[item.promotionStatus] ?? 0) + 1;
    modeCounts[item.mode] = (modeCounts[item.mode] ?? 0) + 1;
    sourceVersionCounts[item.sourceVersion] =
      (sourceVersionCounts[item.sourceVersion] ?? 0) + 1;
    environmentCounts[item.environment] =
      (environmentCounts[item.environment] ?? 0) + 1;
    auditRunSet.add(item.auditRunId);

    if (item.safety.isSidecarOnly) sidecarOnlyCount += 1;
    if (item.promotionStatus === "promoted") promotedCount += 1;
    if (item.rolledBack) rolledBackCount += 1;
    if (isDryRunPayloadBlocked(row)) blockedCount += 1;

    if (isP76CanonicalSidecarAppliedToMatchResultViolation(row)) {
      appliedToMatchResultViolationCount += 1;
    }
    if (isP76CanonicalSidecarAppliedToFinalScoreViolation(row)) {
      appliedToFinalScoreViolationCount += 1;
    }
    if (row.appliedToWorkerRanking === true) {
      appliedToWorkerRankingViolationCount += 1;
    }
  }

  return {
    totalVisible: items.length,
    sidecarOnlyCount,
    promotedCount,
    blockedCount,
    rolledBackCount,
    appliedToMatchResultViolationCount,
    appliedToFinalScoreViolationCount,
    appliedToWorkerRankingViolationCount,
    promotionStatusCounts,
    modeCounts,
    sourceVersionCounts,
    environmentCounts,
    latestAuditRunIds: Array.from(auditRunSet).slice(0, 10),
  };
}

export function encodeP76CanonicalSidecarAdminListCursor(row: {
  createdAt: Date;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: row.createdAt.toISOString(),
      id: row.id,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeP76CanonicalSidecarAdminListCursor(
  cursor: string,
): { createdAt: Date; id: string } | null {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { createdAt?: string; id?: string };
    if (!raw.createdAt || !raw.id) return null;
    const createdAt = new Date(raw.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: raw.id };
  } catch {
    return null;
  }
}
