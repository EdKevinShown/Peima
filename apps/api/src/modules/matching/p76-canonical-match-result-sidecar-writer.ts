/**
 * P7.10-r3f1 — canonical match result sidecar writer (dry-run only; no Prisma / no DB).
 */

import {
  readP76CanonicalMatchResultSidecarWriterEnv,
  resolveP76CanonicalMatchResultSidecarWriterMode,
} from "./p76-canonical-match-result-sidecar-writer-env";
import { assertP76CanonicalMatchResultSidecarPayloadPrivacySafe } from "./p76-canonical-match-result-sidecar-writer-privacy";
import { mapP76CanonicalMatchResultSidecarDryRunRowToCreateInputLike } from "./p76-canonical-match-result-sidecar-writer-row";
import {
  P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_RESULT_SCHEMA_VERSION,
  P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
  P76CanonicalMatchResultSidecarWriterError,
  type P76CanonicalMatchResultSidecarWriterEnv,
  type P76CanonicalMatchResultSidecarWriterInputV1,
  type P76CanonicalMatchResultSidecarWriterMode,
  type P76CanonicalMatchResultSidecarWriterResultV1,
  type P76CanonicalMatchResultSidecarWriterRowInputV1,
} from "./p76-canonical-match-result-sidecar-writer.types";

export { P76CanonicalMatchResultSidecarWriterError } from "./p76-canonical-match-result-sidecar-writer.types";
export {
  readP76CanonicalMatchResultSidecarWriterEnv,
  resolveP76CanonicalMatchResultSidecarWriterMode,
  normalizeP76CanonicalMatchResultSidecarWriterEnvironment,
} from "./p76-canonical-match-result-sidecar-writer-env";
export {
  assertP76CanonicalMatchResultSidecarPayloadPrivacySafe,
  findP76CanonicalMatchResultSidecarForbiddenKey,
  P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_FORBIDDEN_JSON_KEYS,
} from "./p76-canonical-match-result-sidecar-writer-privacy";
export {
  assertP76CanonicalMatchResultSidecarDryRunPayloadMappable,
  mapP76CanonicalMatchResultSidecarDryRunRowToCreateInputLike,
} from "./p76-canonical-match-result-sidecar-writer-row";
export type {
  P76CanonicalMatchResultSidecarCreateInputLikeV1,
  P76CanonicalMatchResultSidecarWriterEnv,
  P76CanonicalMatchResultSidecarWriterInputV1,
  P76CanonicalMatchResultSidecarWriterResultV1,
  P76CanonicalMatchResultSidecarWriterRowInputV1,
  P76CanonicalMatchResultSidecarWriterRowSummaryV1,
} from "./p76-canonical-match-result-sidecar-writer.types";

function norm(s: string): string {
  return s.trim();
}

function incrementReason(counts: Record<string, number>, reason: string): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

function isViewerAllowlisted(
  viewerUserId: string,
  allowlist: string[],
): boolean {
  if (allowlist.length === 0) return true;
  const trimmed = viewerUserId.trim();
  return allowlist.some((id) => id.trim() === trimmed);
}

function emptyResult(
  input: P76CanonicalMatchResultSidecarWriterInputV1,
  mode: P76CanonicalMatchResultSidecarWriterMode,
  overrides: Partial<P76CanonicalMatchResultSidecarWriterResultV1> = {},
): P76CanonicalMatchResultSidecarWriterResultV1 {
  return {
    schemaVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_RESULT_SCHEMA_VERSION,
    sourceVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
    auditRunId: norm(input.auditRunId),
    environment: input.environment,
    mode,
    attemptedCount: 0,
    mappedCount: 0,
    insertedCount: 0,
    duplicateCount: 0,
    blockedCount: 0,
    skippedCount: 0,
    appliedToMatchResultCount: 0,
    appliedToFinalScoreCount: 0,
    appliedToWorkerRankingCount: 0,
    reasonCounts: {},
    errors: [],
    rowSummaries: [],
    ...overrides,
  };
}

export function validateP76CanonicalMatchResultSidecarWriterInput(
  input: P76CanonicalMatchResultSidecarWriterInputV1,
): void {
  if (!norm(input.auditRunId)) {
    throw new P76CanonicalMatchResultSidecarWriterError("auditRunId is required");
  }
  if (input.environment !== "dev" && input.environment !== "staging") {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "environment must be dev or staging",
    );
  }
  if (!Array.isArray(input.rows)) {
    throw new P76CanonicalMatchResultSidecarWriterError("rows must be an array");
  }
}

function assertWriterEnvironmentAligned(
  input: P76CanonicalMatchResultSidecarWriterInputV1,
  writerEnv: P76CanonicalMatchResultSidecarWriterEnv,
): void {
  if (writerEnv.normalizedEnvironment == null) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "writer environment is not dev or staging",
    );
  }
  if (input.environment !== writerEnv.normalizedEnvironment) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      `input.environment ${input.environment} must match writer env ${writerEnv.normalizedEnvironment}`,
    );
  }
}

function skipRow(
  row: P76CanonicalMatchResultSidecarWriterRowInputV1,
  code: string,
  message: string,
  reasonCounts: Record<string, number>,
  errors: P76CanonicalMatchResultSidecarWriterResultV1["errors"],
): void {
  incrementReason(reasonCounts, code);
  errors.push({
    viewerUserId: row.dryRunPayload?.viewerUserId,
    code,
    message,
  });
}

function processDryRunRows(
  input: P76CanonicalMatchResultSidecarWriterInputV1,
  writerEnv: P76CanonicalMatchResultSidecarWriterEnv,
): Pick<
  P76CanonicalMatchResultSidecarWriterResultV1,
  "mappedCount" | "skippedCount" | "reasonCounts" | "errors" | "rowSummaries"
> {
  const reasonCounts: Record<string, number> = {};
  const errors: P76CanonicalMatchResultSidecarWriterResultV1["errors"] = [];
  const rowSummaries: P76CanonicalMatchResultSidecarWriterResultV1["rowSummaries"] =
    [];
  let skippedCount = 0;

  const mapCtx = {
    auditRunId: norm(input.auditRunId),
    environment: input.environment,
  };

  for (const row of input.rows) {
    const payload = row.dryRunPayload;
    if (!isViewerAllowlisted(payload.viewerUserId, writerEnv.viewerAllowlist)) {
      skippedCount += 1;
      skipRow(row, "not_allowlisted", "viewer not on allowlist", reasonCounts, errors);
      continue;
    }
    if (
      payload.sourceVersion.trim() !== writerEnv.expectedSourceVersion.trim()
    ) {
      skippedCount += 1;
      skipRow(
        row,
        "stale_source_version",
        `payload.sourceVersion ${payload.sourceVersion} != ${writerEnv.expectedSourceVersion}`,
        reasonCounts,
        errors,
      );
      continue;
    }
    try {
      assertP76CanonicalMatchResultSidecarPayloadPrivacySafe(payload);
    } catch (err) {
      skippedCount += 1;
      skipRow(
        row,
        "forbidden_payload_key",
        err instanceof Error ? err.message : "forbidden payload",
        reasonCounts,
        errors,
      );
      continue;
    }
    try {
      const createInputLike = mapP76CanonicalMatchResultSidecarDryRunRowToCreateInputLike(
        row,
        mapCtx,
      );
      incrementReason(reasonCounts, payload.guardrails.reason || "ok");
      rowSummaries.push({
        viewerUserId: createInputLike.viewerUserId,
        selectedCandidateId: createInputLike.selectedCandidateId,
        eligible: true,
        guardrailReason: payload.guardrails.reason,
        promotionStatus: "not_promoted",
        mode: "sidecar",
        appliedToMatchResult: false,
        appliedToFinalScore: false,
        appliedToWorkerRanking: false,
        createInputLike,
      });
    } catch (err) {
      skippedCount += 1;
      const message =
        err instanceof Error ? err.message : "unknown validation error";
      const code =
        err instanceof P76CanonicalMatchResultSidecarWriterError
          ? payload.guardrails.eligible
            ? "validation_error"
            : "guardrails_ineligible"
          : "row_error";
      skipRow(row, code, message, reasonCounts, errors);
    }
  }

  return {
    mappedCount: rowSummaries.length,
    skippedCount,
    reasonCounts,
    errors,
    rowSummaries,
  };
}

/**
 * Dry-run canonical match result sidecar writer: maps payloads only; never touches DB.
 */
export function dryRunP76CanonicalMatchResultSidecarWriter(
  input: P76CanonicalMatchResultSidecarWriterInputV1,
  writerEnv: P76CanonicalMatchResultSidecarWriterEnv = readP76CanonicalMatchResultSidecarWriterEnv(),
): P76CanonicalMatchResultSidecarWriterResultV1 {
  validateP76CanonicalMatchResultSidecarWriterInput(input);
  assertWriterEnvironmentAligned(input, writerEnv);

  const mode = resolveP76CanonicalMatchResultSidecarWriterMode(writerEnv);

  if (
    mode === "disabled" ||
    mode === "kill_switch" ||
    mode === "blocked_production" ||
    mode === "blocked_environment"
  ) {
    return emptyResult(input, mode, {
      attemptedCount: input.rows.length,
      blockedCount: input.rows.length,
      errors:
        writerEnv.blockedReason != null
          ? [
              {
                code: writerEnv.blockedReason,
                message: `writer blocked: ${writerEnv.blockedReason}`,
              },
            ]
          : [],
    });
  }

  if (mode === "insert_only_requested" || mode === "insert_only_blocked") {
    return emptyResult(input, mode, {
      attemptedCount: input.rows.length,
      blockedCount: input.rows.length,
      errors: [
        {
          code: "insert_only_not_implemented_in_r3f1",
          message:
            "insert-only sidecar writer is not implemented in P7.10-r3f1",
        },
      ],
      reasonCounts: { insert_only_not_implemented_in_r3f1: input.rows.length },
    });
  }

  const processed = processDryRunRows(input, writerEnv);

  return {
    schemaVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_RESULT_SCHEMA_VERSION,
    sourceVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
    auditRunId: norm(input.auditRunId),
    environment: input.environment,
    mode: "dry_run",
    attemptedCount: input.rows.length,
    mappedCount: processed.mappedCount,
    insertedCount: 0,
    duplicateCount: 0,
    blockedCount: 0,
    skippedCount: processed.skippedCount,
    appliedToMatchResultCount: 0,
    appliedToFinalScoreCount: 0,
    appliedToWorkerRankingCount: 0,
    reasonCounts: processed.reasonCounts,
    errors: processed.errors,
    rowSummaries: processed.rowSummaries,
  };
}
