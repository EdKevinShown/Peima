/**
 * P7.10-r6a — aggregate canonical writer shadow payloads (pure; no DB).
 */

import {
  assertCanonicalWriterShadowNeverWritesMatchResult,
  buildP76CanonicalWriterShadowPayloadV1,
} from "./p76-canonical-writer-shadow-builder";
import type { P76CanonicalWriterShadowPayloadV1 } from "./p76-canonical-writer-shadow.types";
import type { P76ReadPathEnv } from "./p76-read-path-env";

export const P76_CANONICAL_WRITER_SHADOW_AUDIT_SCHEMA_VERSION = 1 as const;

export const P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_VERSION =
  "p7.10-r6a-canonical-writer-shadow-audit-v1" as const;

export const P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_TYPE =
  "p76_canonical_writer_shadow_audit" as const;

export type P76CanonicalWriterShadowAuditRowInputV1 = {
  matchResult: {
    id: string;
    userId?: string;
    candidateUserId: string | null;
    finalScore: number | null;
    matchInsights?: unknown;
  };
  sidecar?: {
    id: string;
    viewerUserId: string;
    selectedCandidateId: string;
    sourceVersion: string;
    allowlistMatched: boolean;
    pmSignoffStatus: string;
    opsSignoffStatus: string;
    applied: boolean;
    dryRun: boolean;
    rolledBack: boolean;
    appliedToMatchResult: boolean;
    appliedToFinalScore: boolean;
    appliedToWorkerRanking: boolean;
    appliedToDisplay: boolean;
  } | null;
  sidecarCandidateExists?: boolean;
  notes?: string[];
};

export type P76CanonicalWriterShadowAuditBuildInputV1 = {
  generatedAt: string;
  rows: P76CanonicalWriterShadowAuditRowInputV1[];
  includeBlocked?: boolean;
  readPathEnv?: P76ReadPathEnv;
  shadowEnv?: NodeJS.ProcessEnv;
};

export type P76CanonicalWriterShadowAuditReportV1 = {
  schemaVersion: typeof P76_CANONICAL_WRITER_SHADOW_AUDIT_SCHEMA_VERSION;
  sourceType: typeof P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_TYPE;
  sourceVersion: typeof P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_VERSION;
  generatedAt: string;
  mode: "dev_audit";
  dryRun: true;
  appliedToMatchResultCount: 0;
  totalRows: number;
  eligibleCount: number;
  blockedCount: number;
  wouldChangeCandidateCount: number;
  reasonCounts: Record<string, number>;
  scoreDeltaBandCounts: Record<string, number>;
  rows: Array<{
    matchResultId: string;
    viewerUserId: string | null;
    shadow: P76CanonicalWriterShadowPayloadV1;
  }>;
};

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function shadowAuditEnv(base?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...(base ?? process.env),
    PEIMA_P76_CANONICAL_WRITER_SHADOW_ENABLED: "1",
  };
}

export function buildP76CanonicalWriterShadowAuditReport(
  input: P76CanonicalWriterShadowAuditBuildInputV1,
): P76CanonicalWriterShadowAuditReportV1 {
  const includeBlocked = input.includeBlocked !== false;
  const env = shadowAuditEnv(input.shadowEnv);
  const reasonCounts: Record<string, number> = {};
  const scoreDeltaBandCounts: Record<string, number> = {};

  let eligibleCount = 0;
  let blockedCount = 0;
  let wouldChangeCandidateCount = 0;

  const builtRows: P76CanonicalWriterShadowAuditReportV1["rows"] = [];

  for (const row of input.rows) {
    const viewerUserId =
      row.matchResult.userId?.trim() ||
      row.sidecar?.viewerUserId?.trim() ||
      "";

    const shadow = buildP76CanonicalWriterShadowPayloadV1(
      {
        viewerUserId,
        generatedAt: input.generatedAt,
        baseline: {
          candidateUserId: row.matchResult.candidateUserId,
          finalScore: row.matchResult.finalScore,
          displaySourceType: "match_result_original",
        },
        sidecar: row.sidecar
          ? {
              id: row.sidecar.id,
              viewerUserId: row.sidecar.viewerUserId,
              selectedCandidateId: row.sidecar.selectedCandidateId,
              sourceVersion: row.sidecar.sourceVersion,
              allowlistMatched: row.sidecar.allowlistMatched,
              pmSignoffStatus: row.sidecar.pmSignoffStatus,
              opsSignoffStatus: row.sidecar.opsSignoffStatus,
              applied: row.sidecar.applied,
              dryRun: row.sidecar.dryRun,
              rolledBack: row.sidecar.rolledBack,
              appliedToMatchResult: row.sidecar.appliedToMatchResult,
              appliedToFinalScore: row.sidecar.appliedToFinalScore,
              appliedToWorkerRanking: row.sidecar.appliedToWorkerRanking,
              appliedToDisplay: row.sidecar.appliedToDisplay,
            }
          : null,
        sidecarCandidateExists: row.sidecarCandidateExists,
        notes: row.notes,
      },
      { env, readPathEnv: input.readPathEnv },
    );

    assertCanonicalWriterShadowNeverWritesMatchResult(shadow);

    bump(reasonCounts, shadow.guardrails.reason);
    bump(scoreDeltaBandCounts, shadow.comparison.scoreDeltaBand);

    if (shadow.guardrails.eligible) {
      eligibleCount += 1;
    } else {
      blockedCount += 1;
    }
    if (shadow.comparison.wouldChangeCandidate) {
      wouldChangeCandidateCount += 1;
    }

    if (includeBlocked || shadow.guardrails.eligible) {
      builtRows.push({
        matchResultId: row.matchResult.id,
        viewerUserId: viewerUserId || null,
        shadow,
      });
    }
  }

  for (const r of builtRows) {
    if (r.shadow.appliedToMatchResult !== false) {
      throw new Error(
        "P7.10-r6a invariant: audit row shadow.appliedToMatchResult must be false",
      );
    }
  }

  return {
    schemaVersion: P76_CANONICAL_WRITER_SHADOW_AUDIT_SCHEMA_VERSION,
    sourceType: P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_TYPE,
    sourceVersion: P76_CANONICAL_WRITER_SHADOW_AUDIT_SOURCE_VERSION,
    generatedAt: input.generatedAt,
    mode: "dev_audit",
    dryRun: true,
    appliedToMatchResultCount: 0,
    totalRows: input.rows.length,
    eligibleCount,
    blockedCount,
    wouldChangeCandidateCount,
    reasonCounts,
    scoreDeltaBandCounts,
    rows: builtRows,
  };
}
