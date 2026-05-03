/**
 * M5.6-B4 — dry-run hook job consumer foundation: map job → writer input, call writer with `dryRun: true` only.
 * No DB status updates, no GET/worker registration, no meta/summary persistence (see docs/M5/M5.6-b4-…).
 */

import type { WriteRrmTop2DisplayMetaForMatchResultResult } from "./matching-rrm-top2-display-meta-writer";
import {
  writeRrmTop2DisplayMetaForMatchResult,
  type WriteRrmTop2DisplayMetaForMatchResultPrisma,
} from "./matching-rrm-top2-display-meta-writer";
import { tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights } from "./matching-rrm-sim-readonly-summary";
import type { RrmTop2DisplayMetaGuardrailsV1 } from "./rrm-top2-display-meta.types";
import type { RrmTop2HookJobRow } from "./rrm-top2-hook-job.types";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function norm(s: string): string {
  return s.trim();
}

/** Same contract as writer `isExplicitPassGuardrails` (explicit pass only). */
function isExplicitPassGuardrails(g: RrmTop2DisplayMetaGuardrailsV1): boolean {
  if (!g || g.status !== "pass") return false;
  if (!Array.isArray(g.blockReasons) || g.blockReasons.length > 0) return false;
  if (!Array.isArray(g.cautionReasons) || g.cautionReasons.length > 0) return false;
  return true;
}

export type RrmTop2HookJobConsumerDryRunNoOpReason =
  | "static_top2_missing"
  | "top2_invalid"
  | "top2_duplicate"
  | "guardrails_missing"
  | "rrm_summary_missing";

export type ExtractStaticTop2FromHookSnapshotResult =
  | { ok: true; candidateUserIds: readonly [string, string] }
  | { ok: false; reason: RrmTop2HookJobConsumerDryRunNoOpReason };

/**
 * Read Top2 ids from `staticTop2Snapshot` (`candidateUserIds` preferred; legacy `top2` array supported).
 */
export function extractStaticTop2FromHookSnapshot(snapshot: unknown): ExtractStaticTop2FromHookSnapshotResult {
  if (snapshot == null) {
    return { ok: false, reason: "static_top2_missing" };
  }
  if (!isRecord(snapshot)) {
    return { ok: false, reason: "top2_invalid" };
  }

  let raw: unknown[] | null = null;
  const cids = snapshot.candidateUserIds;
  const top2 = snapshot.top2;
  if (Array.isArray(cids)) {
    raw = cids;
  } else if (Array.isArray(top2)) {
    raw = top2;
  } else {
    return { ok: false, reason: "top2_invalid" };
  }

  if (raw.length !== 2) {
    return { ok: false, reason: "top2_invalid" };
  }
  const a = typeof raw[0] === "string" ? norm(raw[0]) : "";
  const b = typeof raw[1] === "string" ? norm(raw[1]) : "";
  if (!a || !b) {
    return { ok: false, reason: "static_top2_missing" };
  }
  if (a === b) {
    return { ok: false, reason: "top2_duplicate" };
  }
  return { ok: true, candidateUserIds: [a, b] as const };
}

export function tryParseHookJobGuardrails(raw: unknown): RrmTop2DisplayMetaGuardrailsV1 | null {
  if (raw == null) {
    return null;
  }
  if (!isRecord(raw)) {
    return null;
  }
  const st = raw.status;
  if (st !== "pass" && st !== "caution" && st !== "block" && st !== "not_evaluated") {
    return null;
  }
  if (!Array.isArray(raw.blockReasons) || !Array.isArray(raw.cautionReasons)) {
    return null;
  }
  const blockReasons = raw.blockReasons.filter((x): x is string => typeof x === "string").map((s) => s.trim());
  const cautionReasons = raw.cautionReasons.filter((x): x is string => typeof x === "string").map((s) => s.trim());
  const sourceVersion = typeof raw.sourceVersion === "string" && raw.sourceVersion.trim() ? raw.sourceVersion.trim() : undefined;
  return {
    status: st,
    blockReasons,
    cautionReasons,
    ...(sourceVersion ? { sourceVersion } : {}),
  };
}

export type ProcessRrmTop2HookJobDryRunInput = {
  prisma: WriteRrmTop2DisplayMetaForMatchResultPrisma;
  job: RrmTop2HookJobRow;
  now?: Date;
  /** Tests / controlled runs: default `true` so dry-run does not depend on env. */
  metaWriteEnabled?: boolean;
  summaryWriteEnabled?: boolean;
  /** Tests only: override writer. */
  writeRrmTop2DisplayMetaForMatchResultFn?: typeof writeRrmTop2DisplayMetaForMatchResult;
};

export type ProcessRrmTop2HookJobDryRunResult = {
  jobId: string;
  matchResultId: string;
  wouldProcess: boolean;
  wouldSkip: boolean;
  noOpReasonCode: string | null;
  writerResult: WriteRrmTop2DisplayMetaForMatchResultResult | null;
  candidateUserIdUnchanged: true;
  finalScoreUnchanged: true;
};

function skipResult(
  job: RrmTop2HookJobRow,
  code: RrmTop2HookJobConsumerDryRunNoOpReason | string,
): ProcessRrmTop2HookJobDryRunResult {
  return {
    jobId: job.id,
    matchResultId: job.matchResultId,
    wouldProcess: false,
    wouldSkip: true,
    noOpReasonCode: code,
    writerResult: null,
    candidateUserIdUnchanged: true,
    finalScoreUnchanged: true,
  };
}

/**
 * Pure dry-run: no hook-job status updates, no meta/summary writes (`dryRun: true`, `summaryWriteEnabled: false`).
 * When guardrails are explicit pass, requires existing `rrmSimReadonlySummary` on `MatchResult.matchInsights` (no construction from sim jobs).
 */
export async function processRrmTop2HookJobDryRun(
  input: ProcessRrmTop2HookJobDryRunInput,
): Promise<ProcessRrmTop2HookJobDryRunResult> {
  const job = input.job;
  const writerFn = input.writeRrmTop2DisplayMetaForMatchResultFn ?? writeRrmTop2DisplayMetaForMatchResult;

  const top2Ex = extractStaticTop2FromHookSnapshot(job.staticTop2Snapshot);
  if (!top2Ex.ok) {
    return skipResult(job, top2Ex.reason);
  }

  const guardrails = tryParseHookJobGuardrails(job.guardrails);
  if (!guardrails) {
    return skipResult(job, "guardrails_missing");
  }

  if (isExplicitPassGuardrails(guardrails)) {
    const row = await input.prisma.matchResult.findUnique({ where: { id: norm(job.matchResultId) } });
    if (row) {
      const summary = tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights(row.matchInsights);
      if (!summary) {
        return skipResult(job, "rrm_summary_missing");
      }
    }
  }

  const wr = await writerFn({
    prisma: input.prisma,
    matchResultId: job.matchResultId,
    staticTop2CandidateUserIds: top2Ex.candidateUserIds,
    top2Fingerprint: job.top2Fingerprint,
    guardrails,
    sourceVersion: norm(job.sourceVersion) || undefined,
    metaWriteEnabled: input.metaWriteEnabled ?? true,
    summaryWriteEnabled: input.summaryWriteEnabled ?? false,
    dryRun: true,
  });

  return {
    jobId: job.id,
    matchResultId: job.matchResultId,
    wouldProcess: wr.ok === true,
    wouldSkip: wr.ok !== true,
    noOpReasonCode: wr.noOpReasonCode,
    writerResult: wr,
    candidateUserIdUnchanged: true,
    finalScoreUnchanged: true,
  };
}
