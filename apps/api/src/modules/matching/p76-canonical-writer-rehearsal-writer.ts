/**
 * P7.10-r6f1/r6f2 — rehearsal sidecar writer (dry-run + insert-only).
 */

import { Prisma } from "@peima/database";
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
  type P76CanonicalWriterRehearsalMetaCreateInput,
  type P76CanonicalWriterRehearsalWriterDeps,
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
  P76CanonicalWriterRehearsalWriterDeps,
  P76CanonicalWriterRehearsalWriterInput,
  P76CanonicalWriterRehearsalWriterPrisma,
  P76CanonicalWriterRehearsalWriterResultV1,
  P76CanonicalWriterRehearsalWriterRowInput,
  P76RehearsalSidecarWriterEnv,
} from "./p76-canonical-writer-rehearsal-writer.types";

function norm(s: string): string {
  return s.trim();
}

export function isP76RehearsalWriterPrismaUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export function assertP76CanonicalWriterRehearsalWriterPrismaSurfaceSafe(
  prisma: P76CanonicalWriterRehearsalWriterDeps["prisma"],
): void {
  const unsafe = prisma as {
    matchResult?: { update?: unknown; create?: unknown; upsert?: unknown };
  };
  if (unsafe.matchResult?.update != null) {
    throw new P76CanonicalWriterRehearsalWriterError(
      "unsafe prisma surface: matchResult.update must not be available to rehearsal writer",
    );
  }
  if (unsafe.matchResult?.create != null) {
    throw new P76CanonicalWriterRehearsalWriterError(
      "unsafe prisma surface: matchResult.create must not be available to rehearsal writer",
    );
  }
  if (unsafe.matchResult?.upsert != null) {
    throw new P76CanonicalWriterRehearsalWriterError(
      "unsafe prisma surface: matchResult.upsert must not be available to rehearsal writer",
    );
  }
}

export function assertP76CanonicalWriterRehearsalCreateInputSafe(
  data: P76CanonicalWriterRehearsalMetaCreateInput,
): void {
  if (data.appliedToMatchResult !== false) {
    throw new P76CanonicalWriterRehearsalWriterError(
      "appliedToMatchResult must be false on rehearsal insert",
    );
  }
  if (data.environment !== "dev" && data.environment !== "staging") {
    throw new P76CanonicalWriterRehearsalWriterError(
      "environment must be dev or staging on rehearsal insert",
    );
  }
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

function toRowSummary(
  row: P76CanonicalWriterRehearsalWriterRowInput,
): P76CanonicalWriterRehearsalWriterResultV1["dryRunRowSummaries"][number] {
  return {
    matchResultId: row.matchResultId.trim(),
    viewerUserId: row.viewerUserId.trim(),
    eligible: row.shadow.guardrails.eligible,
    guardrailReason: row.shadow.guardrails.reason,
    wouldChangeCandidate: row.shadow.comparison.wouldChangeCandidate,
    appliedToMatchResult: false,
  };
}

function assertInsertEnvironmentAligned(
  input: P76CanonicalWriterRehearsalWriterInput,
  writerEnv: P76RehearsalSidecarWriterEnv,
): void {
  if (writerEnv.normalizedEnvironment == null) {
    throw new P76CanonicalWriterRehearsalWriterError(
      "writer environment is not dev or staging",
    );
  }
  if (input.environment !== writerEnv.normalizedEnvironment) {
    throw new P76CanonicalWriterRehearsalWriterError(
      `input.environment ${input.environment} must match writer env ${writerEnv.normalizedEnvironment}`,
    );
  }
}

type ProcessedRehearsalRows = {
  reasonCounts: Record<string, number>;
  errors: P76CanonicalWriterRehearsalWriterResultV1["errors"];
  dryRunRowSummaries: P76CanonicalWriterRehearsalWriterResultV1["dryRunRowSummaries"];
  skippedCount: number;
  createInputs: P76CanonicalWriterRehearsalMetaCreateInput[];
};

function processRehearsalWriterRows(
  input: P76CanonicalWriterRehearsalWriterInput,
): ProcessedRehearsalRows {
  const reasonCounts: Record<string, number> = {};
  const errors: P76CanonicalWriterRehearsalWriterResultV1["errors"] = [];
  const dryRunRowSummaries: P76CanonicalWriterRehearsalWriterResultV1["dryRunRowSummaries"] =
    [];
  const createInputs: P76CanonicalWriterRehearsalMetaCreateInput[] = [];
  let skippedCount = 0;

  const mapCtx = {
    auditRunId: input.auditRunId,
    environment: input.environment,
    readPathSourceVersion: input.readPathSourceVersion,
  };

  for (const row of input.rows) {
    try {
      validateP76CanonicalWriterRehearsalWriterRow(row);
      const data = mapP76CanonicalWriterRehearsalRowToCreateInput(row, mapCtx);
      assertP76CanonicalWriterRehearsalCreateInputSafe(data);
      createInputs.push(data);
      incrementReason(reasonCounts, row.shadow.guardrails.reason);
      dryRunRowSummaries.push(toRowSummary(row));
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

  return {
    reasonCounts,
    errors,
    dryRunRowSummaries,
    skippedCount,
    createInputs,
  };
}

function buildResult(
  input: P76CanonicalWriterRehearsalWriterInput,
  mode: P76CanonicalWriterRehearsalWriterResultV1["mode"],
  processed: ProcessedRehearsalRows,
  counts: {
    insertedCount: number;
    duplicateCount: number;
    blockedCount: number;
  },
): P76CanonicalWriterRehearsalWriterResultV1 {
  return {
    schemaVersion: P76_REHEARSAL_WRITER_RESULT_SCHEMA_VERSION,
    sourceVersion: P76_REHEARSAL_WRITER_SOURCE_VERSION,
    auditRunId: norm(input.auditRunId),
    environment: input.environment,
    mode,
    attemptedCount: input.rows.length,
    insertedCount: counts.insertedCount,
    skippedCount: processed.skippedCount,
    duplicateCount: counts.duplicateCount,
    blockedCount: counts.blockedCount,
    appliedToMatchResultCount: 0,
    reasonCounts: processed.reasonCounts,
    errors: processed.errors,
    dryRunRowSummaries: processed.dryRunRowSummaries,
  };
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
      "insert_only mode requires insertOnlyP76CanonicalWriterRehearsalWriter",
    );
  }

  const processed = processRehearsalWriterRows(input);

  return buildResult(input, "dry_run", processed, {
    insertedCount: 0,
    duplicateCount: 0,
    blockedCount: 0,
  });
}

/**
 * Insert-only rehearsal writer (P7.10-r6f2).
 * Calls prisma.p76CanonicalWriterRehearsalMeta.create only when env gates pass.
 */
export async function insertOnlyP76CanonicalWriterRehearsalWriter(
  input: P76CanonicalWriterRehearsalWriterInput,
  deps: P76CanonicalWriterRehearsalWriterDeps,
): Promise<P76CanonicalWriterRehearsalWriterResultV1> {
  const writerEnv =
    deps.writerEnv ?? readP76RehearsalSidecarWriterEnv(process.env);

  validateP76CanonicalWriterRehearsalWriterInput(input);
  assertP76CanonicalWriterRehearsalWriterPrismaSurfaceSafe(deps.prisma);

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

  if (mode !== "insert_only" || !writerEnv.canInsert) {
    return emptyResult(input, mode === "insert_only" ? "dry_run" : mode, {
      blockedCount: input.rows.length,
      errors: [
        {
          code: writerEnv.blockedReason ?? "insert_not_allowed",
          message: `insert blocked: ${writerEnv.blockedReason ?? mode}`,
        },
      ],
    });
  }

  assertInsertEnvironmentAligned(input, writerEnv);

  const processed = processRehearsalWriterRows(input);
  let insertedCount = 0;
  let duplicateCount = 0;

  for (let i = 0; i < processed.createInputs.length; i++) {
    const data = processed.createInputs[i]!;
    const summaryRow = processed.dryRunRowSummaries[i];
    try {
      await deps.prisma.p76CanonicalWriterRehearsalMeta.create({ data });
      insertedCount += 1;
    } catch (err) {
      if (isP76RehearsalWriterPrismaUniqueViolation(err)) {
        duplicateCount += 1;
        continue;
      }
      processed.skippedCount += 1;
      if (summaryRow != null) {
        const idx = processed.dryRunRowSummaries.indexOf(summaryRow);
        if (idx >= 0) {
          processed.dryRunRowSummaries.splice(idx, 1);
        }
      }
      processed.errors.push({
        matchResultId: data.matchResultId,
        code: "insert_error",
        message: err instanceof Error ? err.message : "insert failed",
      });
    }
  }

  return buildResult(input, "insert_only", processed, {
    insertedCount,
    duplicateCount,
    blockedCount: 0,
  });
}
