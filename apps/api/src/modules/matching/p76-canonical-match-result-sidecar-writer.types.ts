/**
 * P7.10-r3f1 — canonical match result sidecar writer types (dry-run; no Prisma).
 */

import type { P76CanonicalWriterDryRunPayloadV1 } from "./p76-canonical-writer-dry-run.types";

export const P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_RESULT_SCHEMA_VERSION =
  1 as const;

export const P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION =
  "p7.10-r3f1-canonical-sidecar-writer-v1" as const;

export type P76CanonicalMatchResultSidecarWriterMode =
  | "disabled"
  | "dry_run"
  | "insert_only_blocked"
  | "insert_only_requested"
  | "kill_switch"
  | "blocked_production"
  | "blocked_environment";

export type P76CanonicalMatchResultSidecarWriterBlockedReason =
  | "disabled"
  | "kill_switch"
  | "dry_run"
  | "db_write_not_allowed"
  | "production_blocked"
  | "invalid_environment"
  | "insert_only_not_implemented_in_r3f1";

export type P76CanonicalMatchResultSidecarWriterEnv = {
  enabled: boolean;
  dryRun: boolean;
  allowDbWrite: boolean;
  killSwitch: boolean;
  environment: string;
  normalizedEnvironment: "dev" | "staging" | null;
  nodeEnv: string;
  expectedSourceVersion: string;
  viewerAllowlist: string[];
  canInsert: boolean;
  blockedReason: P76CanonicalMatchResultSidecarWriterBlockedReason | null;
};

export type P76CanonicalMatchResultSidecarWriterRowInputV1 = {
  dryRunPayload: P76CanonicalWriterDryRunPayloadV1;
  matchResultId?: string | null;
  pmSignoffStatus?: string;
  opsSignoffStatus?: string;
};

export type P76CanonicalMatchResultSidecarWriterInputV1 = {
  auditRunId: string;
  environment: "dev" | "staging";
  rows: P76CanonicalMatchResultSidecarWriterRowInputV1[];
};

export type P76CanonicalMatchResultSidecarWriterRowSummaryV1 = {
  viewerUserId: string;
  selectedCandidateId: string;
  eligible: boolean;
  guardrailReason: string;
  promotionStatus: "not_promoted";
  mode: "sidecar";
  appliedToMatchResult: false;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  createInputLike: P76CanonicalMatchResultSidecarCreateInputLikeV1;
};

export type P76CanonicalMatchResultSidecarCreateInputLikeV1 = {
  auditRunId: string;
  environment: "dev" | "staging";
  viewerUserId: string;
  matchResultId: string | null;
  selectedCandidateId: string;
  sourceType: string;
  sourceVersion: string;
  schemaVersion: number;
  mode: "sidecar";
  score: number | null;
  reasonSummary: string | null;
  stageSummary: unknown;
  safeFallbackMeta: unknown;
  guardrails: unknown;
  dryRunPayload: P76CanonicalWriterDryRunPayloadV1;
  appliedToMatchResult: false;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  promotionStatus: "not_promoted";
  pmSignoffStatus: string;
  opsSignoffStatus: string;
  rolledBack: false;
};

export class P76CanonicalMatchResultSidecarWriterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P76CanonicalMatchResultSidecarWriterError";
  }
}

export type P76CanonicalMatchResultSidecarWriterErrorEntry = {
  viewerUserId?: string;
  code: string;
  message: string;
};

export type P76CanonicalMatchResultSidecarWriterResultV1 = {
  schemaVersion: typeof P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_RESULT_SCHEMA_VERSION;
  sourceVersion: typeof P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION;
  auditRunId: string;
  environment: "dev" | "staging";
  mode: P76CanonicalMatchResultSidecarWriterMode;
  attemptedCount: number;
  mappedCount: number;
  insertedCount: 0;
  duplicateCount: 0;
  blockedCount: number;
  skippedCount: number;
  appliedToMatchResultCount: 0;
  appliedToFinalScoreCount: 0;
  appliedToWorkerRankingCount: 0;
  reasonCounts: Record<string, number>;
  errors: P76CanonicalMatchResultSidecarWriterErrorEntry[];
  rowSummaries: P76CanonicalMatchResultSidecarWriterRowSummaryV1[];
};
