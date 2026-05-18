/**
 * P7.10-r6f1 — rehearsal sidecar writer (dry-run only; no DB writes).
 */

import { assertCanonicalWriterShadowNeverWritesMatchResult } from "./p76-canonical-writer-shadow-builder";
import {
  readP76RehearsalSidecarWriterEnv,
  resolveP76RehearsalSidecarWriterMode,
} from "./p76-canonical-writer-rehearsal-writer-env";
import {
  assertP76CanonicalWriterRehearsalShadowPrivacyBundle,
} from "./p76-canonical-writer-rehearsal-writer-privacy";
import { mapP76CanonicalWriterRehearsalRowToCreateInput } from "./p76-canonical-writer-rehearsal-writer-row";
import {
  P76_REHEARSAL_WRITER_RESULT_SCHEMA_VERSION,
  P76_REHEARSAL_WRITER_SOURCE_VERSION,
  P76CanonicalWriterRehearsalWriterError,
  type P76CanonicalWriterRehearsalWriterInput,
  type P76CanonicalWriterRehearsalWriterResultV1,
  type P76CanonicalWriterRehearsalWriterRowInput,
  type P76RehearsalSidecarWriterEnv,
} from "./p76-canonical-writer-rehearsal-writer.types";

export { P76CanonicalWriterRehearsalWriterError } from "./p76-canonical-writer-rehearsal-writer.types";
export {
  readP76RehearsalSidecarWriterEnv,
  resolveP76RehearsalSidecarWriterMode,
  normalizeP76RehearsalSidecarWriterEnvironment,
} from "./p76-canonical-writer-rehearsal-writer-env";
export {
  assertP76CanonicalWriterRehearsalPrivacySafe,
  assertP76CanonicalWriterRehearsalShadowPrivacyBundle,
  P76_REHEARSAL_WRITER_FORBIDDEN_JSON_KEYS,
  P76_REHEARSAL_WRITER_MAX_SHADOW_PAYLOAD_BYTES,
} from "./p76-canonical-writer-rehearsal-writer-privacy";
export { mapP76CanonicalWriterRehearsalRowToCreateInput } from "./p76-canonical-writer-rehearsal-writer-row";
export type {
  P76CanonicalWriterRehearsalWriterInput,
  P76CanonicalWriterRehearsalWriterResultV1,
  P76CanonicalWriterRehearsalWriterRowInput,
  P76RehearsalSidecarWriterEnv,
} from "./p76-canonical-writer-rehearsal-writer.types";

function norm(s: string): string {
  return s.trim();
}

export function validateP76CanonicalWriterRehearsalWriterInput(
  input: P76CanonicalWriterRehearsalWriterInput,
): void {
  if (!norm(input.auditRunId)) {
    throw new P76CanonicalWriterRehearsalWriterError("auditRunId is required");
  }
  if (input.environment !== "dev" && input.environment !== "staging") {
    throw new P76CanonicalWriterRehearsalWriterError(
      "environment must be dev or staging",
    );
  }
  if (!norm(input.readPathSourceVersion)) {
    throw new P76CanonicalWriterRehearsalWriterError(
      "readPathSourceVersion is required",
    );
  }
  if (!Array.isArray(input.rows)) {
    throw new P76CanonicalWriterRehearsalWriterError("rows must be an array");
  }
}

export function validateP76CanonicalWriterRehearsalWriterRow(
  row: P76CanonicalWriterRehearsalWriterRowInput,
): void {
  if (!norm(row.matchResultId)) {
    throw new P76CanonicalWriterRehearsalWriterError(
      "matchResultId is required on each row",
    );
  }
  if (!norm(row.viewerUserId)) {
    throw new P76CanonicalWriterRehearsalWriterError(
      "viewerUserId is required on each row",
    );
  }
  assertCanonicalWriterShadowNeverWritesMatchResult(row.shadow);
  if (!row.shadow.guardrails.reason?.trim()) {
    throw new P76CanonicalWriterRehearsalWriterError(
      "shadow.guardrails.reason is required",
    );
  }
  assertP76CanonicalWriterRehearsalShadowPrivacyBundle(row.shadow);
}

function emptyResult(
  input: P76CanonicalWriterRehearsalWriterInput,
  mode: P76CanonicalWriterRehearsalWriterResultV1["mode"],
  overrides: Partial<P76CanonicalWriterRehearsalWriterResultV1> = {},
): P76CanonicalWriterRehearsalWriterResultV1 {
  return {
    schemaVersion: P76_REHEARSAL_WRITER_RESULT_SCHEMA_VERSION,
    sourceVersion: P76_REHEARSAL_WRITER_SOURCE_VERSION,
    auditRunId: norm(input.auditRunId),
    environment: input.environment,
    mode,
    attemptedCount: 0,
    insertedCount: 0,
    skippedCount: 0,
    duplicateCount: 0,
    blockedCount: 0,
    appliedToMatchResultCount: 0,
    reasonCounts: {},
    errors: [],
    dryRunRowSummaries: [],
    ...overrides,
  };
}

function incrementReason(
  counts: Record<string, number>,
  reason: string,
): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

/**
 * Dry-run rehearsal writer: validates, maps rows, returns summary.
 * Never calls Prisma create / update / delete (r6f1).
 */
export function dryRunP76CanonicalWriterRehearsalWriter(
  input: P76CanonicalWriterRehearsalWriterInput,
  writerEnv: P76RehearsalSidecarWriterEnv = readP76RehearsalSidecarWriterEnv(),
): P76CanonicalWriterRehearsalWriterResultV1 {
  validateP76CanonicalWriterRehearsalWriterInput(input);

  const mode = resolveP76RehearsalSidecarWriterMode(writerEnv);

  if (
    mode === "disabled" ||
    mode === "kill_switch" ||
    mode === "blocked_production"
  ) {
    return emptyResult(input, mode, {
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

  if (mode === "insert_only") {
    throw new P76CanonicalWriterRehearsalWriterError(
      "insert_only mode is not implemented in P7.10-r6f1 (dry-run only)",
    );
  }

  const reasonCounts: Record<string, number> = {};
  const errors: P76CanonicalWriterRehearsalWriterResultV1["errors"] = [];
  const dryRunRowSummaries: P76CanonicalWriterRehearsalWriterResultV1["dryRunRowSummaries"] =
    [];
  let skippedCount = 0;

  for (const row of input.rows) {
    try {
      validateP76CanonicalWriterRehearsalWriterRow(row);
      mapP76CanonicalWriterRehearsalRowToCreateInput(row, {
        auditRunId: input.auditRunId,
        environment: input.environment,
        readPathSourceVersion: input.readPathSourceVersion,
      });
      incrementReason(reasonCounts, row.shadow.guardrails.reason);
      dryRunRowSummaries.push({
        matchResultId: row.matchResultId.trim(),
        viewerUserId: row.viewerUserId.trim(),
        eligible: row.shadow.guardrails.eligible,
        guardrailReason: row.shadow.guardrails.reason,
        wouldChangeCandidate: row.shadow.comparison.wouldChangeCandidate,
        appliedToMatchResult: false,
      });
    } catch (err) {
      skippedCount += 1;
      const message =
        err instanceof Error ? err.message : "unknown validation error";
      const code =
        err instanceof P76CanonicalWriterRehearsalWriterError
          ? "validation_error"
          : "row_error";
      errors.push({
        matchResultId: row.matchResultId,
        code,
        message,
      });
    }
  }

  const attemptedCount = input.rows.length;

  return {
    schemaVersion: P76_REHEARSAL_WRITER_RESULT_SCHEMA_VERSION,
    sourceVersion: P76_REHEARSAL_WRITER_SOURCE_VERSION,
    auditRunId: norm(input.auditRunId),
    environment: input.environment,
    mode: "dry_run",
    attemptedCount,
    insertedCount: 0,
    skippedCount,
    duplicateCount: 0,
    blockedCount: 0,
    appliedToMatchResultCount: 0,
    reasonCounts,
    errors,
    dryRunRowSummaries,
  };
}
