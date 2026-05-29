/**
 * P7.10-r3f1/r3f2 — canonical match result sidecar writer (dry-run + insert-only).
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
  type P76CanonicalMatchResultSidecarCreateInputLikeV1,
  type P76CanonicalMatchResultSidecarWriterDeps,
  type P76CanonicalMatchResultSidecarWriterEnv,
  type P76CanonicalMatchResultSidecarWriterInputV1,
  type P76CanonicalMatchResultSidecarWriterMode,
  type P76CanonicalMatchResultSidecarWriterPrisma,
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
  P76CanonicalMatchResultSidecarWriterDeps,
  P76CanonicalMatchResultSidecarWriterEnv,
  P76CanonicalMatchResultSidecarWriterInputV1,
  P76CanonicalMatchResultSidecarWriterPrisma,
  P76CanonicalMatchResultSidecarWriterResultV1,
  P76CanonicalMatchResultSidecarWriterRowInputV1,
  P76CanonicalMatchResultSidecarWriterRowSummaryV1,
} from "./p76-canonical-match-result-sidecar-writer.types";

export function isP76CanonicalMatchResultSidecarWriterPrismaUniqueViolation(
  err: unknown,
): boolean {
  return (
    typeof err === "object" &&
    err != null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

export function assertP76CanonicalMatchResultSidecarWriterPrismaSurfaceSafe(
  prisma: P76CanonicalMatchResultSidecarWriterPrisma,
): void {
  const unsafe = prisma as {
    matchResult?: { update?: unknown; create?: unknown; upsert?: unknown; delete?: unknown };
    p76CanonicalMatchResultMeta?: {
      update?: unknown;
      upsert?: unknown;
      delete?: unknown;
    };
  };
  if (unsafe.matchResult?.update != null) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "unsafe prisma surface: matchResult.update must not be available to sidecar writer",
    );
  }
  if (unsafe.matchResult?.create != null) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "unsafe prisma surface: matchResult.create must not be available to sidecar writer",
    );
  }
  if (unsafe.matchResult?.upsert != null) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "unsafe prisma surface: matchResult.upsert must not be available to sidecar writer",
    );
  }
  if (unsafe.matchResult?.delete != null) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "unsafe prisma surface: matchResult.delete must not be available to sidecar writer",
    );
  }
  if (unsafe.p76CanonicalMatchResultMeta?.update != null) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "unsafe prisma surface: p76CanonicalMatchResultMeta.update must not be available to sidecar writer",
    );
  }
  if (unsafe.p76CanonicalMatchResultMeta?.upsert != null) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "unsafe prisma surface: p76CanonicalMatchResultMeta.upsert must not be available to sidecar writer",
    );
  }
  if (unsafe.p76CanonicalMatchResultMeta?.delete != null) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "unsafe prisma surface: p76CanonicalMatchResultMeta.delete must not be available to sidecar writer",
    );
  }
}

export function assertP76CanonicalMatchResultSidecarCreateInputSafe(
  data: P76CanonicalMatchResultSidecarCreateInputLikeV1,
): void {
  if (data.appliedToMatchResult !== false) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "appliedToMatchResult must be false on sidecar insert",
    );
  }
  if (data.appliedToFinalScore !== false) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "appliedToFinalScore must be false on sidecar insert",
    );
  }
  if (data.appliedToWorkerRanking !== false) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "appliedToWorkerRanking must be false on sidecar insert",
    );
  }
  if (data.environment !== "dev" && data.environment !== "staging") {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "environment must be dev or staging on sidecar insert",
    );
  }
  if (data.promotionStatus !== "not_promoted") {
    throw new P76CanonicalMatchResultSidecarWriterError(
      "promotionStatus must be not_promoted on sidecar insert",
    );
  }
}

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

/**
 * Insert-only canonical match result sidecar writer (P7.10-r3f2).
 * Calls prisma.p76CanonicalMatchResultMeta.create only when env gates pass.
 */
export async function insertOnlyP76CanonicalMatchResultSidecarWriter(
  input: P76CanonicalMatchResultSidecarWriterInputV1,
  deps: P76CanonicalMatchResultSidecarWriterDeps,
): Promise<P76CanonicalMatchResultSidecarWriterResultV1> {
  const writerEnv =
    deps.writerEnv ?? readP76CanonicalMatchResultSidecarWriterEnv(process.env);

  validateP76CanonicalMatchResultSidecarWriterInput(input);
  assertWriterEnvironmentAligned(input, writerEnv);
  assertP76CanonicalMatchResultSidecarWriterPrismaSurfaceSafe(deps.prisma);

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

  if (mode !== "insert_only_requested" || !writerEnv.canInsert) {
    const blockedMode: P76CanonicalMatchResultSidecarWriterMode =
      mode === "insert_only_requested" ? "dry_run" : mode;
    return emptyResult(input, blockedMode, {
      attemptedCount: input.rows.length,
      blockedCount: input.rows.length,
      errors: [
        {
          code: writerEnv.blockedReason ?? "insert_not_allowed",
          message: `insert blocked: ${writerEnv.blockedReason ?? mode}`,
        },
      ],
    });
  }

  const processed = processDryRunRows(input, writerEnv);
  let insertedCount = 0;
  let duplicateCount = 0;
  let skippedCount = processed.skippedCount;
  const errors = [...processed.errors];
  const rowSummaries = [...processed.rowSummaries];

  for (let i = rowSummaries.length - 1; i >= 0; i--) {
    const summary = rowSummaries[i]!;
    const data = summary.createInputLike;
    try {
      assertP76CanonicalMatchResultSidecarCreateInputSafe(data);
      await deps.prisma.p76CanonicalMatchResultMeta["create"]({ data });
      insertedCount += 1;
    } catch (err) {
      if (isP76CanonicalMatchResultSidecarWriterPrismaUniqueViolation(err)) {
        duplicateCount += 1;
        continue;
      }
      skippedCount += 1;
      rowSummaries.splice(i, 1);
      errors.push({
        viewerUserId: data.viewerUserId,
        code: "insert_error",
        message: err instanceof Error ? err.message : "insert failed",
      });
    }
  }

  return {
    schemaVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_RESULT_SCHEMA_VERSION,
    sourceVersion: P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION,
    auditRunId: norm(input.auditRunId),
    environment: input.environment,
    mode: "insert_only",
    attemptedCount: input.rows.length,
    mappedCount: processed.mappedCount,
    insertedCount,
    duplicateCount,
    blockedCount: 0,
    skippedCount,
    appliedToMatchResultCount: 0,
    appliedToFinalScoreCount: 0,
    appliedToWorkerRankingCount: 0,
    reasonCounts: processed.reasonCounts,
    errors,
    rowSummaries,
  };
}
