/**
 * M5.6-B7-B — shared RRM Top2 hook job apply / dry-run batch processing (no GET, no worker registration).
 * Used by `m56-b5-rrm-top2-hook-job-apply-runner.ts` and intended for future poller reuse.
 */

import type { WriteRrmTop2DisplayMetaForMatchResultResult } from "./matching-rrm-top2-display-meta-writer";
import {
  writeRrmTop2DisplayMetaForMatchResult,
  type WriteRrmTop2DisplayMetaForMatchResultPrisma,
} from "./matching-rrm-top2-display-meta-writer";
import {
  findPendingRrmTop2HookJobs,
  markRrmTop2HookJobFailed,
  markRrmTop2HookJobProcessed,
  markRrmTop2HookJobProcessing,
  markRrmTop2HookJobSkipped,
  type RrmTop2HookJobPrisma,
} from "./rrm-top2-hook-job.service";
import {
  extractStaticTop2FromHookSnapshot,
  processRrmTop2HookJobDryRun,
  tryParseHookJobGuardrails,
  type ProcessRrmTop2HookJobDryRunResult,
} from "./rrm-top2-hook-job-consumer";
import { tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights } from "./matching-rrm-sim-readonly-summary";
import type { RrmTop2DisplayMetaGuardrailsV1 } from "./rrm-top2-display-meta.types";
import type { RrmTop2HookJobRow } from "./rrm-top2-hook-job.types";

export type RrmTop2HookJobApplyPrisma = RrmTop2HookJobPrisma & WriteRrmTop2DisplayMetaForMatchResultPrisma;

export type RrmTop2HookJobApplyDeps = {
  findPendingRrmTop2HookJobs: typeof findPendingRrmTop2HookJobs;
  processRrmTop2HookJobDryRun: typeof processRrmTop2HookJobDryRun;
  markRrmTop2HookJobProcessing: typeof markRrmTop2HookJobProcessing;
  markRrmTop2HookJobProcessed: typeof markRrmTop2HookJobProcessed;
  markRrmTop2HookJobSkipped: typeof markRrmTop2HookJobSkipped;
  markRrmTop2HookJobFailed: typeof markRrmTop2HookJobFailed;
  writeRrmTop2DisplayMetaForMatchResult: typeof writeRrmTop2DisplayMetaForMatchResult;
};

/**
 * Writer / preflight no-op codes that must end in `skipped` (never `failed`) when writer returns `ok: false`.
 */
export const RRM_TOP2_HOOK_WRITER_NO_OP_SKIP_CODES = new Set<string>([
  "writer_disabled",
  "existing_meta_frozen",
  "static_top2_missing",
  "rrm_summary_missing",
  "rrm_summary_invalid",
  "guardrails_missing",
  "guardrails_invalid",
  "guardrails_caution",
  "guardrails_block",
  "guardrails_not_evaluated",
  "guardrails_pass_predicate_failed",
  "rrm_confidence_low",
  "rrm_confidence_unknown",
  "rrm_fallback_used",
  "selected_not_in_top2",
  "rrm_winner_not_in_top2",
  "rrm_meta_winner_mismatch",
  "top2_invalid",
  "top2_duplicate",
  "baseline_mismatch",
  "summary_write_disabled",
  "summary_write_failed",
  "match_result_missing",
  "top2_fingerprint_missing",
  "fingerprint_mismatch",
  "proposed_user_not_found",
  "meta_schema_invalid",
  "meta_missing",
  "meta_applied_flags_invalid",
  "top2_count_invalid",
  "rrm_summary_schema_invalid",
  "rrm_summary_version_rejected",
  "env_off",
  "display_source_type_unknown",
  "no_meta_write",
  "unknown_writer_noop",
]);

export function isRrmTop2HookWriterNoOpSkipReason(code: string | null | undefined): boolean {
  if (code == null || norm(String(code)) === "") {
    return true;
  }
  return RRM_TOP2_HOOK_WRITER_NO_OP_SKIP_CODES.has(norm(String(code)));
}

function norm(s: string): string {
  return s.trim();
}

function isExplicitPassGuardrails(g: RrmTop2DisplayMetaGuardrailsV1): boolean {
  if (!g || g.status !== "pass") return false;
  if (!Array.isArray(g.blockReasons) || g.blockReasons.length > 0) return false;
  if (!Array.isArray(g.cautionReasons) || g.cautionReasons.length > 0) return false;
  return true;
}

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export type RrmTop2HookJobApplyDryRunItem = {
  index: number;
  wouldProcess: boolean;
  wouldSkip: boolean;
  noOpReasonCode: string | null;
};

export type RrmTop2HookJobApplyDryRunAggregate = {
  refused: false;
  mode: "dry_run";
  apply: false;
  sourceVersion: string;
  totalJobsRead: number;
  wouldProcessCount: number;
  wouldSkipCount: number;
  noOpReasonCounts: Record<string, number>;
  writerOkCount: number;
  writerNoOpCount: number;
  candidateUserIdUnchangedAll: true;
  finalScoreUnchangedAll: true;
  items: RrmTop2HookJobApplyDryRunItem[];
};

export type RrmTop2HookJobApplyItem = {
  index: number;
  outcome: "processed" | "skipped" | "failed";
  noOpReasonCode: string | null;
  errorCode: string | null;
};

export type RrmTop2HookJobApplyBatchResult = {
  refused: false;
  mode: "apply";
  apply: true;
  sourceVersion: string;
  totalJobsRead: number;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  noOpReasonCounts: Record<string, number>;
  candidateUserIdUnchangedAll: true;
  finalScoreUnchangedAll: true;
  items: RrmTop2HookJobApplyItem[];
};

/** Terminal state after a successful writer return (non-throw). */
export type RrmTop2HookWriterTerminalStatus = "processed" | "skipped";

/**
 * Map writer result to terminal hook disposition (before DB `mark*`).
 * `failed` only arises from thrown errors in `applySingleRrmTop2HookJob`.
 */
export function mapWriterResultToHookStatus(wr: WriteRrmTop2DisplayMetaForMatchResultResult): RrmTop2HookWriterTerminalStatus {
  if (wr.ok === true && wr.wroteMeta === true) {
    return "processed";
  }
  return "skipped";
}

/** Normalized `noOpReasonCode` persisted on `skipped` rows when writer returned `ok: false` (or edge `no_meta_write`). */
export function mapWriterNoOpToSkippedReason(wr: WriteRrmTop2DisplayMetaForMatchResultResult): string {
  if (wr.ok === true && wr.wroteMeta !== true) {
    return "no_meta_write";
  }
  const c = wr.noOpReasonCode != null && norm(String(wr.noOpReasonCode)) ? norm(String(wr.noOpReasonCode)) : "unknown_writer_noop";
  return c;
}

function summarizeDryItem(r: ProcessRrmTop2HookJobDryRunResult, index: number): RrmTop2HookJobApplyDryRunItem {
  return {
    index,
    wouldProcess: r.wouldProcess,
    wouldSkip: r.wouldSkip,
    noOpReasonCode: r.noOpReasonCode,
  };
}

function viewerSafeProcessedMeta(wr: WriteRrmTop2DisplayMetaForMatchResultResult): Record<string, unknown> {
  return {
    outcome: "processed",
    writerOk: wr.ok,
    wroteMeta: wr.wroteMeta,
    wroteSummary: wr.wroteSummary,
    writerSourceVersion: wr.sourceVersion,
  };
}

function viewerSafeSkippedMeta(code: string): Record<string, unknown> {
  return { outcome: "skipped", reason: code };
}

function viewerSafeUnknownSkipMeta(code: string | null): Record<string, unknown> {
  return {
    outcome: "skipped",
    reason: code && norm(code) ? norm(code) : "unknown_writer_noop",
    note: "unlisted_no_op_mapped_to_skipped",
  };
}

export async function processRrmTop2HookJobsDryRunAggregate(input: {
  prisma: RrmTop2HookJobApplyPrisma;
  limit: number;
  sourceVersion: string;
  deps?: Partial<Pick<RrmTop2HookJobApplyDeps, "findPendingRrmTop2HookJobs" | "processRrmTop2HookJobDryRun">>;
}): Promise<RrmTop2HookJobApplyDryRunAggregate> {
  const findPending = input.deps?.findPendingRrmTop2HookJobs ?? findPendingRrmTop2HookJobs;
  const processDry = input.deps?.processRrmTop2HookJobDryRun ?? processRrmTop2HookJobDryRun;
  const jobs = await findPending({ prisma: input.prisma, limit: input.limit });

  const noOpReasonCounts: Record<string, number> = {};
  let wouldProcessCount = 0;
  let wouldSkipCount = 0;
  let writerOkCount = 0;
  let writerNoOpCount = 0;
  const items: RrmTop2HookJobApplyDryRunItem[] = [];

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    const r = await processDry({ prisma: input.prisma, job });
    items.push(summarizeDryItem(r, i));
    if (r.wouldProcess) wouldProcessCount += 1;
    if (r.wouldSkip) wouldSkipCount += 1;
    if (r.writerResult?.ok === true) writerOkCount += 1;
    if (r.writerResult != null && r.writerResult.ok === false) writerNoOpCount += 1;
    if (r.noOpReasonCode) bump(noOpReasonCounts, r.noOpReasonCode);
  }

  return {
    refused: false,
    mode: "dry_run",
    apply: false,
    sourceVersion: input.sourceVersion,
    totalJobsRead: jobs.length,
    wouldProcessCount,
    wouldSkipCount,
    noOpReasonCounts,
    writerOkCount,
    writerNoOpCount,
    candidateUserIdUnchangedAll: true,
    finalScoreUnchangedAll: true,
    items,
  };
}

/**
 * Apply path for a single job: `processing` → writer (`dryRun: false`) → `processed` | `skipped` | `failed`.
 * Caller must enforce apply gate (CLI flags, poller env, etc.).
 */
export async function applySingleRrmTop2HookJob(input: {
  prisma: RrmTop2HookJobApplyPrisma;
  job: RrmTop2HookJobRow;
  index: number;
  deps?: Partial<RrmTop2HookJobApplyDeps>;
}): Promise<RrmTop2HookJobApplyItem> {
  const { prisma, job, index } = input;
  const markP = input.deps?.markRrmTop2HookJobProcessing ?? markRrmTop2HookJobProcessing;
  const markOk = input.deps?.markRrmTop2HookJobProcessed ?? markRrmTop2HookJobProcessed;
  const markSkip = input.deps?.markRrmTop2HookJobSkipped ?? markRrmTop2HookJobSkipped;
  const markFail = input.deps?.markRrmTop2HookJobFailed ?? markRrmTop2HookJobFailed;
  const writerFn = input.deps?.writeRrmTop2DisplayMetaForMatchResult ?? writeRrmTop2DisplayMetaForMatchResult;

  await markP({ prisma, jobId: job.id });

  try {
    const top2Ex = extractStaticTop2FromHookSnapshot(job.staticTop2Snapshot);
    if (!top2Ex.ok) {
      await markSkip({
        prisma,
        jobId: job.id,
        noOpReasonCode: top2Ex.reason,
        metaWriteResult: viewerSafeSkippedMeta(top2Ex.reason),
      });
      return { index, outcome: "skipped", noOpReasonCode: top2Ex.reason, errorCode: null };
    }

    const guardrails = tryParseHookJobGuardrails(job.guardrails);
    if (!guardrails) {
      const code = "guardrails_missing";
      await markSkip({ prisma, jobId: job.id, noOpReasonCode: code, metaWriteResult: viewerSafeSkippedMeta(code) });
      return { index, outcome: "skipped", noOpReasonCode: code, errorCode: null };
    }

    if (isExplicitPassGuardrails(guardrails)) {
      const row = await prisma.matchResult.findUnique({ where: { id: norm(job.matchResultId) } });
      if (row) {
        const summary = tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights(row.matchInsights);
        if (!summary) {
          const code = "rrm_summary_missing";
          await markSkip({
            prisma,
            jobId: job.id,
            noOpReasonCode: code,
            metaWriteResult: viewerSafeSkippedMeta(code),
          });
          return { index, outcome: "skipped", noOpReasonCode: code, errorCode: null };
        }
      }
    }

    const wr = await writerFn({
      prisma,
      matchResultId: job.matchResultId,
      staticTop2CandidateUserIds: top2Ex.candidateUserIds,
      top2Fingerprint: job.top2Fingerprint,
      guardrails,
      sourceVersion: norm(job.sourceVersion) || undefined,
      dryRun: false,
    });

    const terminal = mapWriterResultToHookStatus(wr);
    if (terminal === "processed") {
      await markOk({
        prisma,
        jobId: job.id,
        metaWriteResult: viewerSafeProcessedMeta(wr),
      });
      return { index, outcome: "processed", noOpReasonCode: null, errorCode: null };
    }

    const code = mapWriterNoOpToSkippedReason(wr);
    const meta = RRM_TOP2_HOOK_WRITER_NO_OP_SKIP_CODES.has(code)
      ? viewerSafeSkippedMeta(code)
      : viewerSafeUnknownSkipMeta(wr.noOpReasonCode);
    await markSkip({
      prisma,
      jobId: job.id,
      noOpReasonCode: code,
      metaWriteResult: meta,
    });
    return { index, outcome: "skipped", noOpReasonCode: code, errorCode: null };
  } catch (e) {
    await markFail({ prisma, jobId: job.id, lastErrorCode: "apply_exception", error: e });
    return {
      index,
      outcome: "failed",
      noOpReasonCode: null,
      errorCode: "apply_exception",
    };
  }
}

export async function processRrmTop2HookJobsApplyBatch(input: {
  prisma: RrmTop2HookJobApplyPrisma;
  limit: number;
  sourceVersion: string;
  deps?: Partial<RrmTop2HookJobApplyDeps>;
}): Promise<RrmTop2HookJobApplyBatchResult> {
  const findPending = input.deps?.findPendingRrmTop2HookJobs ?? findPendingRrmTop2HookJobs;
  const jobs = await findPending({ prisma: input.prisma, limit: input.limit });

  const items: RrmTop2HookJobApplyItem[] = [];
  const noOpReasonCounts: Record<string, number> = {};
  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    const row = await applySingleRrmTop2HookJob({ prisma: input.prisma, job, index: i, deps: input.deps });
    items.push(row);
    if (row.outcome === "processed") processedCount += 1;
    if (row.outcome === "skipped") {
      skippedCount += 1;
      if (row.noOpReasonCode) bump(noOpReasonCounts, row.noOpReasonCode);
    }
    if (row.outcome === "failed") failedCount += 1;
  }

  return {
    refused: false,
    mode: "apply",
    apply: true,
    sourceVersion: input.sourceVersion,
    totalJobsRead: jobs.length,
    processedCount,
    skippedCount,
    failedCount,
    noOpReasonCounts,
    candidateUserIdUnchangedAll: true,
    finalScoreUnchangedAll: true,
    items,
  };
}
