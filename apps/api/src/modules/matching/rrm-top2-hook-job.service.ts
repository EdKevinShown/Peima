/**
 * M5.6-B2 — minimal helpers for `MatchResultRrmTop2DisplayHookJob` (no GET/worker/consumer/writer).
 */

import { RRM_TOP2_HOOK_JOB_STATUS, type RrmTop2HookJobRow } from "./rrm-top2-hook-job.types";

const PENDING = RRM_TOP2_HOOK_JOB_STATUS.PENDING;
const PROCESSING = RRM_TOP2_HOOK_JOB_STATUS.PROCESSING;
const PROCESSED = RRM_TOP2_HOOK_JOB_STATUS.PROCESSED;
const SKIPPED = RRM_TOP2_HOOK_JOB_STATUS.SKIPPED;
const FAILED = RRM_TOP2_HOOK_JOB_STATUS.FAILED;

const MAX_ERROR_MESSAGE_LEN = 500;
const DEFAULT_PENDING_LIMIT = 10;
const MAX_PENDING_LIMIT = 100;

export type RrmTop2HookJobCreateData = {
  matchResult: { connect: { id: string } };
  viewer: { connect: { id: string } };
  sourceVersion: string;
  status: string;
  staticTop2Snapshot: unknown;
  top2Fingerprint: string;
  rrmSourceType: string;
  rrmSourceId?: string | null;
  rrmSummarySourceVersion?: string | null;
  guardrails: unknown;
  auditMeta?: unknown;
  aiSimulationJobId?: string | null;
  pairwiseJobId?: string | null;
  poolId?: string | null;
  batchId?: string | null;
};

export type RrmTop2HookJobPrisma = {
  matchResultRrmTop2DisplayHookJob: {
    findUnique: (args: {
      where:
        | { id: string }
        | {
            matchResultId_top2Fingerprint_sourceVersion: {
              matchResultId: string;
              top2Fingerprint: string;
              sourceVersion: string;
            };
          };
    }) => Promise<RrmTop2HookJobRow | null>;
    create: (args: { data: RrmTop2HookJobCreateData }) => Promise<RrmTop2HookJobRow>;
    findMany: (args: {
      where: { status: string };
      orderBy: { createdAt: "asc" | "desc" };
      take: number;
    }) => Promise<RrmTop2HookJobRow[]>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<RrmTop2HookJobRow>;
  };
};

export type CreateOrGetRrmTop2HookJobInput = {
  prisma: RrmTop2HookJobPrisma;
  matchResultId: string;
  viewerUserId: string;
  sourceVersion: string;
  staticTop2Snapshot: unknown;
  top2Fingerprint: string;
  rrmSourceType: string;
  rrmSourceId?: string | null;
  rrmSummarySourceVersion?: string | null;
  guardrails: unknown;
  aiSimulationJobId?: string | null;
  pairwiseJobId?: string | null;
  poolId?: string | null;
  batchId?: string | null;
  auditMeta?: unknown | null;
};

export type CreateOrGetRrmTop2HookJobResult = {
  job: RrmTop2HookJobRow;
  created: boolean;
};

function compoundWhere(
  matchResultId: string,
  top2Fingerprint: string,
  sourceVersion: string,
): {
  matchResultId: string;
  top2Fingerprint: string;
  sourceVersion: string;
} {
  return { matchResultId: matchResultId.trim(), top2Fingerprint: top2Fingerprint.trim(), sourceVersion: sourceVersion.trim() };
}

function assertNonEmpty(label: string, v: string): string {
  const t = v.trim();
  if (!t) {
    throw new Error(`${label} is required`);
  }
  return t;
}

/**
 * Idempotent create by @@unique([matchResultId, top2Fingerprint, sourceVersion]).
 * Does not validate RRM eligibility; does not touch `MatchResult` or display meta writer.
 */
export async function createOrGetRrmTop2HookJob(
  input: CreateOrGetRrmTop2HookJobInput,
): Promise<CreateOrGetRrmTop2HookJobResult> {
  const matchResultId = assertNonEmpty("matchResultId", input.matchResultId);
  const viewerUserId = assertNonEmpty("viewerUserId", input.viewerUserId);
  const sourceVersion = assertNonEmpty("sourceVersion", input.sourceVersion);
  const top2Fingerprint = assertNonEmpty("top2Fingerprint", input.top2Fingerprint);
  const rrmSourceType = assertNonEmpty("rrmSourceType", input.rrmSourceType);

  const existing = await input.prisma.matchResultRrmTop2DisplayHookJob.findUnique({
    where: {
      matchResultId_top2Fingerprint_sourceVersion: compoundWhere(matchResultId, top2Fingerprint, sourceVersion),
    },
  });
  if (existing) {
    return { job: existing, created: false };
  }

  const data: RrmTop2HookJobCreateData = {
    matchResult: { connect: { id: matchResultId } },
    viewer: { connect: { id: viewerUserId } },
    sourceVersion,
    status: PENDING,
    staticTop2Snapshot: input.staticTop2Snapshot,
    top2Fingerprint,
    rrmSourceType,
    rrmSourceId: input.rrmSourceId?.trim() || null,
    rrmSummarySourceVersion: input.rrmSummarySourceVersion?.trim() || null,
    guardrails: input.guardrails,
    auditMeta: input.auditMeta ?? undefined,
    aiSimulationJobId: input.aiSimulationJobId?.trim() || null,
    pairwiseJobId: input.pairwiseJobId?.trim() || null,
    poolId: input.poolId?.trim() || null,
    batchId: input.batchId?.trim() || null,
  };

  const job = await input.prisma.matchResultRrmTop2DisplayHookJob.create({ data });
  return { job, created: true };
}

export type FindPendingRrmTop2HookJobsInput = {
  prisma: RrmTop2HookJobPrisma;
  limit?: number;
};

export async function findPendingRrmTop2HookJobs(
  input: FindPendingRrmTop2HookJobsInput,
): Promise<RrmTop2HookJobRow[]> {
  const raw = input.limit ?? DEFAULT_PENDING_LIMIT;
  const n = Number.isFinite(raw) ? Math.trunc(raw as number) : DEFAULT_PENDING_LIMIT;
  const take = Math.min(MAX_PENDING_LIMIT, Math.max(1, n));
  return input.prisma.matchResultRrmTop2DisplayHookJob.findMany({
    where: { status: PENDING },
    orderBy: { createdAt: "asc" },
    take,
  });
}

export type MarkRrmTop2HookJobProcessingInput = {
  prisma: RrmTop2HookJobPrisma;
  jobId: string;
  now?: Date;
};

export async function markRrmTop2HookJobProcessing(
  input: MarkRrmTop2HookJobProcessingInput,
): Promise<RrmTop2HookJobRow> {
  const now = input.now ?? new Date();
  return input.prisma.matchResultRrmTop2DisplayHookJob.update({
    where: { id: input.jobId.trim() },
    data: {
      status: PROCESSING,
      lockedAt: now,
      attempts: { increment: 1 },
    },
  });
}

export type MarkRrmTop2HookJobProcessedInput = {
  prisma: RrmTop2HookJobPrisma;
  jobId: string;
  metaWriteResult?: unknown | null;
  now?: Date;
};

export async function markRrmTop2HookJobProcessed(
  input: MarkRrmTop2HookJobProcessedInput,
): Promise<RrmTop2HookJobRow> {
  const now = input.now ?? new Date();
  return input.prisma.matchResultRrmTop2DisplayHookJob.update({
    where: { id: input.jobId.trim() },
    data: {
      status: PROCESSED,
      processedAt: now,
      noOpReasonCode: null,
      metaWriteResult: input.metaWriteResult ?? undefined,
      lastErrorCode: null,
      lastErrorMessage: null,
      lockedAt: null,
    },
  });
}

export type MarkRrmTop2HookJobSkippedInput = {
  prisma: RrmTop2HookJobPrisma;
  jobId: string;
  noOpReasonCode: string;
  metaWriteResult?: unknown | null;
  now?: Date;
};

export async function markRrmTop2HookJobSkipped(
  input: MarkRrmTop2HookJobSkippedInput,
): Promise<RrmTop2HookJobRow> {
  const now = input.now ?? new Date();
  const code = assertNonEmpty("noOpReasonCode", input.noOpReasonCode);
  return input.prisma.matchResultRrmTop2DisplayHookJob.update({
    where: { id: input.jobId.trim() },
    data: {
      status: SKIPPED,
      processedAt: now,
      noOpReasonCode: code,
      metaWriteResult: input.metaWriteResult ?? undefined,
      lockedAt: null,
    },
  });
}

export type MarkRrmTop2HookJobFailedInput = {
  prisma: RrmTop2HookJobPrisma;
  jobId: string;
  lastErrorCode: string;
  error: unknown;
};

export async function markRrmTop2HookJobFailed(
  input: MarkRrmTop2HookJobFailedInput,
): Promise<RrmTop2HookJobRow> {
  const code = assertNonEmpty("lastErrorCode", input.lastErrorCode);
  const msg = sanitizeRrmTop2HookJobError(input.error);
  return input.prisma.matchResultRrmTop2DisplayHookJob.update({
    where: { id: input.jobId.trim() },
    data: {
      status: FAILED,
      lastErrorCode: code,
      lastErrorMessage: msg,
      processedAt: null,
      lockedAt: null,
    },
  });
}

/**
 * Redact common secret patterns; cap length. `undefined` / `null` → `null`.
 */
export function sanitizeRrmTop2HookJobError(input: unknown): string | null {
  if (input == null) {
    return null;
  }
  let s =
    input instanceof Error
      ? input.message
      : typeof input === "string"
        ? input
        : (() => {
            try {
              return JSON.stringify(input);
            } catch {
              return String(input);
            }
          })();
  s = s.trim();
  if (!s) {
    return null;
  }

  s = s.replace(/Bearer\s+[\w-._~+/]+/gi, "[REDACTED_BEARER]");
  s = s.replace(/\bsk-[a-zA-Z0-9]{10,}\b/g, "[REDACTED_API_KEY]");
  s = s.replace(/DATABASE_URL\s*=\s*\S+/gi, "[REDACTED_DATABASE_URL]");
  s = s.replace(/postgres(ql)?:\/\/[^\s]+/gi, "[REDACTED_DB_URL]");
  s = s.replace(/mysql:\/\/[^\s]+/gi, "[REDACTED_DB_URL]");
  s = s.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_API_KEY]");
  s = s.replace(/\b(?:raw\s*)?prompt\s*:\s*[\s\S]{0,200}/gi, "[REDACTED_PROMPT]");
  s = s.replace(/\btranscript\s*:\s*[\s\S]{0,200}/gi, "[REDACTED_TRANSCRIPT]");

  if (s.length > MAX_ERROR_MESSAGE_LEN) {
    s = `${s.slice(0, MAX_ERROR_MESSAGE_LEN - 1)}…`;
  }
  return s;
}
