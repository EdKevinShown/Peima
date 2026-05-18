/**
 * P7.10-r3a — pure builder for P7.6 canonical writer dry-run payload.
 */

import {
  P76_CANONICAL_WRITER_DRY_RUN_SCHEMA_VERSION,
  P76_CANONICAL_WRITER_DRY_RUN_SOURCE_TYPE,
  P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION,
  type P76CanonicalWriterDryRunBuildInputV1,
  type P76CanonicalWriterDryRunGuardrailReason,
  type P76CanonicalWriterDryRunPayloadV1,
} from "./p76-canonical-writer-dry-run.types";

const GUARDRAIL_PRIORITY: P76CanonicalWriterDryRunGuardrailReason[] = [
  "exception",
  "missing_viewer",
  "missing_stage1",
  "missing_stage2",
  "missing_stage3",
  "rolled_back",
  "violation_blocked",
  "stale_source_version",
  "not_allowlisted",
  "missing_selected_candidate",
  "candidate_missing",
  "score_missing",
  "safe_fallback_required",
];

function isPresentStage(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value as object).length > 0;
  }
  return true;
}

function normalizeId(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractSelectedCandidateId(
  input: P76CanonicalWriterDryRunBuildInputV1,
): string {
  const explicit = normalizeId(input.selectedCandidateId ?? undefined);
  if (explicit) return explicit;
  const stage3 = input.stage3Rrm as { selectedByRrmCandidateId?: string | null } | undefined;
  return normalizeId(stage3?.selectedByRrmCandidateId ?? undefined);
}

function extractReasonSummary(input: P76CanonicalWriterDryRunBuildInputV1): string | null {
  if (input.reasonSummary != null && input.reasonSummary.trim()) {
    return input.reasonSummary.trim();
  }
  const stage3 = input.stage3Rrm as { reasonSummary?: string | null } | undefined;
  const fromStage = stage3?.reasonSummary?.trim();
  return fromStage || null;
}

function isViewerAllowlisted(
  viewerUserId: string,
  allowlist: string[] | undefined,
): boolean {
  if (!allowlist || allowlist.length === 0) return true;
  const trimmed = viewerUserId.trim();
  return allowlist.some((id) => id.trim() === trimmed);
}

function isViolationBlocked(violationStatus: string | null | undefined): boolean {
  if (violationStatus == null) return false;
  const v = violationStatus.trim().toLowerCase();
  if (!v || v === "ok") return false;
  return true;
}

function collectGuardrailFailures(
  input: P76CanonicalWriterDryRunBuildInputV1,
): P76CanonicalWriterDryRunGuardrailReason[] {
  const blocked: P76CanonicalWriterDryRunGuardrailReason[] = [];
  const viewerUserId = normalizeId(input.viewerUserId);
  const sourceVersion =
    input.sourceVersion?.trim() || P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION;
  const selectedCandidateId = extractSelectedCandidateId(input);

  if (input.resolverError != null) {
    blocked.push("exception");
  }
  if (!viewerUserId) {
    blocked.push("missing_viewer");
  }
  if (!isPresentStage(input.stage1PhotoVisual)) {
    blocked.push("missing_stage1");
  }
  if (!isPresentStage(input.stage2Ranking)) {
    blocked.push("missing_stage2");
  }
  if (!isPresentStage(input.stage3Rrm)) {
    blocked.push("missing_stage3");
  }
  if (input.rolledBack === true) {
    blocked.push("rolled_back");
  }
  if (isViolationBlocked(input.violationStatus)) {
    blocked.push("violation_blocked");
  }
  const cohortVersion = normalizeId(input.cohortSourceVersion ?? undefined);
  if (cohortVersion && cohortVersion !== sourceVersion) {
    blocked.push("stale_source_version");
  }
  if (viewerUserId && !isViewerAllowlisted(viewerUserId, input.viewerAllowlist)) {
    blocked.push("not_allowlisted");
  }
  if (!selectedCandidateId) {
    blocked.push("missing_selected_candidate");
  }
  if (selectedCandidateId && input.candidateExists === false) {
    blocked.push("candidate_missing");
  }
  if (
    selectedCandidateId &&
    input.candidateExists !== false &&
    (input.score == null || !Number.isFinite(input.score))
  ) {
    blocked.push("score_missing");
  }

  if (blocked.length > 0 && !blocked.includes("safe_fallback_required")) {
    blocked.push("safe_fallback_required");
  }

  return blocked;
}

function pickPrimaryReason(
  blocked: P76CanonicalWriterDryRunGuardrailReason[],
): P76CanonicalWriterDryRunGuardrailReason {
  if (blocked.length === 0) return "ok";
  for (const reason of GUARDRAIL_PRIORITY) {
    if (blocked.includes(reason)) return reason;
  }
  return blocked[0]!;
}

export function evaluateP76CanonicalWriterDryRunGuardrails(
  input: P76CanonicalWriterDryRunBuildInputV1,
): {
  eligible: boolean;
  reason: P76CanonicalWriterDryRunGuardrailReason;
  blockedReasons: P76CanonicalWriterDryRunGuardrailReason[];
} {
  const blocked = collectGuardrailFailures(input);
  const withoutOk = blocked.filter((r) => r !== "ok");
  const reason = pickPrimaryReason(withoutOk);
  return {
    eligible: withoutOk.length === 0,
    reason,
    blockedReasons: withoutOk,
  };
}

export function assertCanonicalWriterDryRunNeverWritesMatchResult(
  payload: Pick<
    P76CanonicalWriterDryRunPayloadV1,
    "appliedToMatchResult" | "appliedToFinalScore" | "appliedToWorkerRanking" | "mode"
  >,
): void {
  if (payload.appliedToMatchResult !== false) {
    throw new Error(
      "P7.10-r3a invariant: canonical writer dry-run must not set appliedToMatchResult=true",
    );
  }
  if (payload.appliedToFinalScore !== false) {
    throw new Error(
      "P7.10-r3a invariant: canonical writer dry-run must not set appliedToFinalScore=true",
    );
  }
  if (payload.appliedToWorkerRanking !== false) {
    throw new Error(
      "P7.10-r3a invariant: canonical writer dry-run must not set appliedToWorkerRanking=true",
    );
  }
  if (payload.mode !== "dry_run") {
    throw new Error("P7.10-r3a invariant: canonical writer dry-run mode must be dry_run");
  }
}

export function buildP76CanonicalWriterDryRunPayloadV1(
  input: P76CanonicalWriterDryRunBuildInputV1,
): P76CanonicalWriterDryRunPayloadV1 {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const sourceVersion =
    input.sourceVersion?.trim() || P76_CANONICAL_WRITER_DRY_RUN_SOURCE_VERSION;
  const viewerUserId = normalizeId(input.viewerUserId);
  const guardrails = evaluateP76CanonicalWriterDryRunGuardrails(input);
  const selectedCandidateId = guardrails.eligible
    ? extractSelectedCandidateId(input) || null
    : null;

  const payload: P76CanonicalWriterDryRunPayloadV1 = {
    schemaVersion: P76_CANONICAL_WRITER_DRY_RUN_SCHEMA_VERSION,
    sourceType: P76_CANONICAL_WRITER_DRY_RUN_SOURCE_TYPE,
    sourceVersion,
    mode: "dry_run",
    viewerUserId,
    selectedCandidateId: selectedCandidateId || null,
    score: guardrails.eligible && Number.isFinite(input.score ?? NaN) ? input.score! : null,
    reasonSummary: guardrails.eligible ? extractReasonSummary(input) : null,
    stageSummary: {
      ...(isPresentStage(input.stage1PhotoVisual)
        ? { stage1PhotoVisual: input.stage1PhotoVisual }
        : {}),
      ...(isPresentStage(input.stage2Ranking)
        ? { stage2Ranking: input.stage2Ranking }
        : {}),
      ...(isPresentStage(input.stage3Rrm) ? { stage3Rrm: input.stage3Rrm } : {}),
    },
    safeFallbackMeta: {
      safeFallbackRequired: !guardrails.eligible,
      reason: guardrails.eligible ? null : guardrails.reason,
    },
    guardrails,
    appliedToMatchResult: false,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    createdAt,
  };

  assertCanonicalWriterDryRunNeverWritesMatchResult(payload);
  return payload;
}
