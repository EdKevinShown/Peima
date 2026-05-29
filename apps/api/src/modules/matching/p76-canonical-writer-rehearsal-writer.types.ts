/**
 * P7.10-r6f1 — rehearsal sidecar writer contracts (dry-run + future insert).
 */

import type { Prisma } from "@peima/database";
import type { P76CanonicalWriterShadowPayloadV1 } from "./p76-canonical-writer-shadow.types";

export const P76_REHEARSAL_WRITER_RESULT_SCHEMA_VERSION = 1 as const;

export const P76_REHEARSAL_WRITER_SOURCE_VERSION =
  "p7.10-r6f-rehearsal-writer-v1" as const;

export const P76_REHEARSAL_WRITER_REHEARSAL_MODE =
  "sidecar_rehearsal" as const;

export type P76RehearsalSidecarWriterEnvironment =
  | "dev"
  | "staging"
  | "production";

export type P76RehearsalSidecarWriterBlockedReason =
  | "disabled"
  | "dry_run"
  | "db_write_not_allowed"
  | "kill_switch"
  | "production_blocked"
  | "invalid_environment";

export type P76RehearsalSidecarWriterMode =
  | "disabled"
  | "dry_run"
  | "insert_only"
  | "blocked_production"
  | "kill_switch";

export type P76RehearsalSidecarWriterEnv = {
  enabled: boolean;
  dryRun: boolean;
  environment: P76RehearsalSidecarWriterEnvironment | string;
  allowDbWrite: boolean;
  killSwitch: boolean;
  canInsert: boolean;
  blockedReason: P76RehearsalSidecarWriterBlockedReason | null;
  nodeEnv: string;
  normalizedEnvironment: "dev" | "staging" | null;
};

export type P76CanonicalWriterRehearsalWriterRowInput = {
  matchResultId: string;
  viewerUserId: string;
  allowlistApplyMetaId?: string | null;
  shadow: P76CanonicalWriterShadowPayloadV1;
  summary?: Record<string, unknown> | null;
};

export type P76CanonicalWriterRehearsalWriterInput = {
  auditRunId: string;
  environment: "dev" | "staging";
  readPathSourceVersion: string;
  rows: P76CanonicalWriterRehearsalWriterRowInput[];
};

export type P76CanonicalWriterRehearsalWriterErrorEntry = {
  matchResultId?: string;
  code: string;
  message: string;
};

export type P76CanonicalWriterRehearsalDryRunRowSummary = {
  matchResultId: string;
  viewerUserId: string;
  eligible: boolean;
  guardrailReason: string;
  wouldChangeCandidate: boolean;
  appliedToMatchResult: false;
};

export type P76CanonicalWriterRehearsalWriterResultV1 = {
  schemaVersion: typeof P76_REHEARSAL_WRITER_RESULT_SCHEMA_VERSION;
  sourceVersion: typeof P76_REHEARSAL_WRITER_SOURCE_VERSION;
  auditRunId: string;
  environment: "dev" | "staging";
  mode: P76RehearsalSidecarWriterMode;
  attemptedCount: number;
  insertedCount: number;
  skippedCount: number;
  duplicateCount: number;
  blockedCount: number;
  appliedToMatchResultCount: 0;
  reasonCounts: Record<string, number>;
  errors: P76CanonicalWriterRehearsalWriterErrorEntry[];
  dryRunRowSummaries: P76CanonicalWriterRehearsalDryRunRowSummary[];
};

export type P76CanonicalWriterRehearsalMetaCreateInput =
  Prisma.P76CanonicalWriterRehearsalMetaUncheckedCreateInput;

/** Narrow Prisma surface: rehearsal create only (no MatchResult mutation). */
export type P76CanonicalWriterRehearsalWriterPrisma = {
  p76CanonicalWriterRehearsalMeta: {
    create: (args: {
      data: P76CanonicalWriterRehearsalMetaCreateInput;
    }) => Promise<{ id: string }>;
  };
};

export type P76CanonicalWriterRehearsalWriterDeps = {
  prisma: P76CanonicalWriterRehearsalWriterPrisma;
  writerEnv?: P76RehearsalSidecarWriterEnv;
};

export class P76CanonicalWriterRehearsalWriterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P76CanonicalWriterRehearsalWriterError";
  }
}
