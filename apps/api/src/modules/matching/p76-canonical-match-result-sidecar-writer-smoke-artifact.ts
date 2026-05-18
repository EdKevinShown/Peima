/**
 * P7.10-r3f3 — smoke summary artifact for canonical match result sidecar writer CLI.
 */

export const P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SMOKE_SOURCE_TYPE =
  "p76_canonical_match_result_sidecar_writer_smoke" as const;

export const P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SMOKE_SOURCE_VERSION =
  "p7.10-r3f3-canonical-sidecar-writer-smoke-v1" as const;

export type P76CanonicalMatchResultSidecarWriterSmokeVerifyV1 = {
  rowCount: number;
  appliedToMatchResultTrueCount: number;
  appliedToFinalScoreTrueCount: number;
  appliedToWorkerRankingTrueCount: number;
  promotionStatusNotPromotedCount: number;
};

export type P76CanonicalMatchResultSidecarWriterSmokeCleanupV1 = {
  requested: boolean;
  deletedCount: number;
  finalRowsForAuditRunId: number;
};

export type P76CanonicalMatchResultSidecarWriterSmokeSafetyV1 = {
  matchResultTouched: false;
  workerTouched: false;
  getTouched: false;
};

export type P76CanonicalMatchResultSidecarWriterSmokeDuplicateProbeV1 = {
  duplicateCount: number;
  rowCountAfter: number;
  rowCountUnchanged: boolean;
};

export type P76CanonicalMatchResultSidecarWriterSmokeSummaryV1 = {
  generatedAt: string;
  sourceType: typeof P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SMOKE_SOURCE_TYPE;
  sourceVersion: typeof P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SMOKE_SOURCE_VERSION;
  auditRunId: string;
  environment: "dev" | "staging";
  mode: "dry_run" | "insert_only";
  attemptedCount: number;
  insertedCount: number;
  duplicateCount: number;
  skippedCount: number;
  blockedCount: number;
  verify: P76CanonicalMatchResultSidecarWriterSmokeVerifyV1;
  cleanup: P76CanonicalMatchResultSidecarWriterSmokeCleanupV1;
  safety: P76CanonicalMatchResultSidecarWriterSmokeSafetyV1;
  duplicateProbe?: P76CanonicalMatchResultSidecarWriterSmokeDuplicateProbeV1;
  pass: boolean;
};

export function evaluateP76CanonicalMatchResultSidecarWriterSmokePass(
  summary: Pick<
    P76CanonicalMatchResultSidecarWriterSmokeSummaryV1,
    "verify" | "cleanup" | "safety" | "duplicateProbe"
  >,
): boolean {
  const v = summary.verify;
  if (v.appliedToMatchResultTrueCount > 0) return false;
  if (v.appliedToFinalScoreTrueCount > 0) return false;
  if (v.appliedToWorkerRankingTrueCount > 0) return false;
  if (summary.safety.matchResultTouched !== false) return false;
  if (summary.safety.workerTouched !== false) return false;
  if (summary.safety.getTouched !== false) return false;
  if (summary.cleanup.requested && summary.cleanup.finalRowsForAuditRunId !== 0) {
    return false;
  }
  if (
    summary.duplicateProbe != null &&
    !summary.duplicateProbe.rowCountUnchanged
  ) {
    return false;
  }
  if (
    summary.duplicateProbe != null &&
    summary.duplicateProbe.duplicateCount <= 0
  ) {
    return false;
  }
  return true;
}

export function formatP76CanonicalMatchResultSidecarWriterSmokeMarkdown(
  summary: P76CanonicalMatchResultSidecarWriterSmokeSummaryV1,
): string {
  const lines = [
    "# P7.10-r3f3 Canonical Match Result Sidecar Writer Local Insert Smoke",
    "",
    `- **generatedAt:** ${summary.generatedAt}`,
    `- **auditRunId:** ${summary.auditRunId}`,
    `- **environment:** ${summary.environment}`,
    `- **mode:** ${summary.mode}`,
    `- **pass:** ${summary.pass}`,
    "",
    "## Counts",
    "",
    `- attempted: ${summary.attemptedCount}`,
    `- inserted: ${summary.insertedCount}`,
    `- duplicate: ${summary.duplicateCount}`,
    `- skipped: ${summary.skippedCount}`,
    `- blocked: ${summary.blockedCount}`,
    "",
    "## Verify",
    "",
    `- rowCount: ${summary.verify.rowCount}`,
    `- appliedToMatchResultTrueCount: ${summary.verify.appliedToMatchResultTrueCount}`,
    `- appliedToFinalScoreTrueCount: ${summary.verify.appliedToFinalScoreTrueCount}`,
    `- appliedToWorkerRankingTrueCount: ${summary.verify.appliedToWorkerRankingTrueCount}`,
    `- promotionStatusNotPromotedCount: ${summary.verify.promotionStatusNotPromotedCount}`,
    "",
    "## Cleanup",
    "",
    `- requested: ${summary.cleanup.requested}`,
    `- deletedCount: ${summary.cleanup.deletedCount}`,
    `- finalRowsForAuditRunId: ${summary.cleanup.finalRowsForAuditRunId}`,
    "",
    "## Safety",
    "",
    `- matchResultTouched: ${summary.safety.matchResultTouched}`,
    `- workerTouched: ${summary.safety.workerTouched}`,
    `- getTouched: ${summary.safety.getTouched}`,
    "",
  ];
  if (summary.duplicateProbe) {
    lines.push(
      "## Duplicate probe",
      "",
      `- duplicateCount: ${summary.duplicateProbe.duplicateCount}`,
      `- rowCountAfter: ${summary.duplicateProbe.rowCountAfter}`,
      `- rowCountUnchanged: ${summary.duplicateProbe.rowCountUnchanged}`,
      "",
    );
  }
  return lines.join("\n");
}
