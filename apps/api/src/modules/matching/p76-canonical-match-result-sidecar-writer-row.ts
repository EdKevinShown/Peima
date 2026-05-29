/**
 * P7.10-r3f1 — map dry-run payload to sidecar create-input-like plain object (no Prisma).
 */

import type { P76CanonicalWriterDryRunPayloadV1 } from "./p76-canonical-writer-dry-run.types";
import {
  P76CanonicalMatchResultSidecarWriterError,
  type P76CanonicalMatchResultSidecarCreateInputLikeV1,
  type P76CanonicalMatchResultSidecarWriterRowInputV1,
} from "./p76-canonical-match-result-sidecar-writer.types";

export type MapP76CanonicalMatchResultSidecarDryRunRowContext = {
  auditRunId: string;
  environment: "dev" | "staging";
  pmSignoffStatus?: string;
  opsSignoffStatus?: string;
};

function norm(s: string | null | undefined): string {
  return typeof s === "string" ? s.trim() : "";
}

export function assertP76CanonicalMatchResultSidecarDryRunPayloadMappable(
  payload: P76CanonicalWriterDryRunPayloadV1,
): void {
  if (payload.mode !== "dry_run") {
    throw new P76CanonicalMatchResultSidecarWriterError(
      `payload.mode must be dry_run, got ${String(payload.mode)}`,
    );
  }
  if (payload.appliedToMatchResult !== false) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "payload.appliedToMatchResult must be false",
    );
  }
  if (payload.appliedToFinalScore !== false) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "payload.appliedToFinalScore must be false",
    );
  }
  if (payload.appliedToWorkerRanking !== false) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "payload.appliedToWorkerRanking must be false",
    );
  }
  if (!payload.guardrails.eligible) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      `guardrails not eligible: ${payload.guardrails.reason}`,
    );
  }
  const selected = norm(payload.selectedCandidateId);
  if (!selected) {
    throw new P76CanonicalMatchResultSidecarWriterError("missing selectedCandidateId");
  }
  if (payload.score == null || !Number.isFinite(payload.score)) {
    throw new P76CanonicalMatchResultSidecarWriterError("score must be finite");
  }
}

export function mapP76CanonicalMatchResultSidecarDryRunRowToCreateInputLike(
  row: P76CanonicalMatchResultSidecarWriterRowInputV1,
  ctx: MapP76CanonicalMatchResultSidecarDryRunRowContext,
): P76CanonicalMatchResultSidecarCreateInputLikeV1 {
  const payload = row.dryRunPayload;
  assertP76CanonicalMatchResultSidecarDryRunPayloadMappable(payload);

  const matchResultId = row.matchResultId?.trim() || null;

  return {
    auditRunId: ctx.auditRunId,
    environment: ctx.environment,
    viewerUserId: norm(payload.viewerUserId),
    matchResultId,
    selectedCandidateId: norm(payload.selectedCandidateId),
    sourceType: payload.sourceType,
    sourceVersion: payload.sourceVersion,
    schemaVersion: payload.schemaVersion,
    mode: "sidecar",
    score: payload.score,
    reasonSummary: payload.reasonSummary,
    stageSummary: payload.stageSummary,
    safeFallbackMeta: payload.safeFallbackMeta,
    guardrails: payload.guardrails,
    dryRunPayload: payload,
    appliedToMatchResult: false,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    promotionStatus: "not_promoted",
    pmSignoffStatus: row.pmSignoffStatus?.trim() || "not_required",
    opsSignoffStatus: row.opsSignoffStatus?.trim() || "not_required",
    rolledBack: false,
  };
}
