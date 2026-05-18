/**
 * P7.7-r3.1 — derive / aggregate / privacy helpers for rehearsal admin API.
 */

import { P76_REHEARSAL_WRITER_FORBIDDEN_JSON_KEYS } from "./p76-canonical-writer-rehearsal-writer-privacy";
import type {
  P76CanonicalRehearsalAdminListItem,
  P76CanonicalRehearsalMetaDbRow,
  P76RehearsalAdminAggregateV1,
  P76RehearsalAdminDerivedV1,
} from "./p76-canonical-rehearsal-admin.types";
import { P76_REHEARSAL_ADMIN_MAX_LIST_LIMIT } from "./p76-canonical-rehearsal-admin.types";

export function normalizeP76RehearsalAdminListLimit(limit?: number): number {
  const n = limit ?? 50;
  if (n < 1) return 50;
  return Math.min(n, P76_REHEARSAL_ADMIN_MAX_LIST_LIMIT);
}

export function deriveP76RehearsalAdminStatuses(
  row: Pick<P76CanonicalRehearsalMetaDbRow, "appliedToMatchResult">,
): P76RehearsalAdminDerivedV1 {
  const violation = row.appliedToMatchResult === true;
  return {
    rehearsalStatus: "shadow_only",
    productApplyStatus: "not_applied",
    mainChainApplyStatus: violation ? "violation_detected" : "none",
    violationStatus: violation ? "p0_applied_to_match_result" : "ok",
  };
}

export function sanitizeP76RehearsalAdminJson(value: unknown): unknown {
  if (value == null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeP76RehearsalAdminJson(item));
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      P76_REHEARSAL_WRITER_FORBIDDEN_JSON_KEYS.some(
        (deny) => deny.toLowerCase() === key.toLowerCase(),
      )
    ) {
      continue;
    }
    out[key] = sanitizeP76RehearsalAdminJson(child);
  }
  return out;
}

export function toP76RehearsalAdminListItem(
  row: P76CanonicalRehearsalMetaDbRow,
): P76CanonicalRehearsalAdminListItem {
  const derived = deriveP76RehearsalAdminStatuses(row);
  return {
    id: row.id,
    generatedAt: row.generatedAt.toISOString(),
    viewerUserId: row.viewerUserId,
    matchResultId: row.matchResultId,
    baselineCandidateUserId: row.baselineCandidateUserId,
    proposedCandidateUserId: row.proposedCandidateUserId,
    wouldChangeCandidate: row.wouldChangeCandidate,
    eligible: row.eligible,
    guardrailReason: row.guardrailReason,
    scoreDeltaBand: row.scoreDeltaBand,
    sourceVersion: row.sourceVersion,
    pipelineVersion: row.pipelineVersion,
    readPathSourceVersion: row.readPathSourceVersion,
    auditRunId: row.auditRunId,
    environment: row.environment,
    appliedToMatchResult: false,
    rehearsalMode: row.rehearsalMode,
    supersededAt: row.supersededAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    ...derived,
  };
}

export function computeP76RehearsalAdminAggregate(
  items: P76CanonicalRehearsalAdminListItem[],
): P76RehearsalAdminAggregateV1 {
  const reasonCounts: Record<string, number> = {};
  const environmentCounts: Record<string, number> = {};
  const auditRunSet = new Set<string>();
  let eligibleCount = 0;
  let wouldChangeCandidateCount = 0;
  let appliedToMatchResultViolationCount = 0;

  for (const item of items) {
    reasonCounts[item.guardrailReason] =
      (reasonCounts[item.guardrailReason] ?? 0) + 1;
    environmentCounts[item.environment] =
      (environmentCounts[item.environment] ?? 0) + 1;
    auditRunSet.add(item.auditRunId);
    if (item.eligible) eligibleCount += 1;
    if (item.wouldChangeCandidate) wouldChangeCandidateCount += 1;
    if (item.violationStatus === "p0_applied_to_match_result") {
      appliedToMatchResultViolationCount += 1;
    }
  }

  return {
    totalVisible: items.length,
    eligibleCount,
    blockedCount: items.length - eligibleCount,
    wouldChangeCandidateCount,
    appliedToMatchResultViolationCount,
    reasonCounts,
    environmentCounts,
    latestAuditRunIds: Array.from(auditRunSet).slice(0, 10),
  };
}

export function encodeP76RehearsalAdminListCursor(row: {
  generatedAt: Date;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      generatedAt: row.generatedAt.toISOString(),
      id: row.id,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeP76RehearsalAdminListCursor(
  cursor: string,
): { generatedAt: Date; id: string } | null {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { generatedAt?: string; id?: string };
    if (!raw.generatedAt || !raw.id) return null;
    const generatedAt = new Date(raw.generatedAt);
    if (Number.isNaN(generatedAt.getTime())) return null;
    return { generatedAt, id: raw.id };
  } catch {
    return null;
  }
}
