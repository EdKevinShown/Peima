/**
 * M5.6-B5-B — controlled apply gate runner for `MatchResultRrmTop2DisplayHookJob` (dev/staging CLI).
 * See `docs/M5/M5.6-b5b-rrm-top2-hook-job-apply-runner.md` and `docs/M5/M5.6-b5a-rrm-top2-hook-job-apply-gate-plan.md`.
 */
import type { WriteRrmTop2DisplayMetaForMatchResultResult } from "../modules/matching/matching-rrm-top2-display-meta-writer";
import {
  writeRrmTop2DisplayMetaForMatchResult,
  type WriteRrmTop2DisplayMetaForMatchResultPrisma,
} from "../modules/matching/matching-rrm-top2-display-meta-writer";
import {
  findPendingRrmTop2HookJobs,
  markRrmTop2HookJobFailed,
  markRrmTop2HookJobProcessed,
  markRrmTop2HookJobProcessing,
  markRrmTop2HookJobSkipped,
  sanitizeRrmTop2HookJobError,
  type RrmTop2HookJobPrisma,
} from "../modules/matching/rrm-top2-hook-job.service";
import {
  extractStaticTop2FromHookSnapshot,
  processRrmTop2HookJobDryRun,
  tryParseHookJobGuardrails,
  type ProcessRrmTop2HookJobDryRunResult,
} from "../modules/matching/rrm-top2-hook-job-consumer";
import { tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights } from "../modules/matching/matching-rrm-sim-readonly-summary";
import type { RrmTop2DisplayMetaGuardrailsV1 } from "../modules/matching/rrm-top2-display-meta.types";
import type { RrmTop2HookJobRow } from "../modules/matching/rrm-top2-hook-job.types";

export const M56_B5_RUNNER_SOURCE_VERSION = "m5.6-b5-rrm-top2-hook-job-apply-runner-v1" as const;
export const M56_B5_CONFIRM_CONTROLLED_APPLY_VALUE = "I_UNDERSTAND" as const;

const DEFAULT_LIMIT = 1;
const MAX_LIMIT = 10;

function norm(s: string): string {
  return s.trim();
}

function isExplicitPassGuardrails(g: RrmTop2DisplayMetaGuardrailsV1): boolean {
  if (!g || g.status !== "pass") return false;
  if (!Array.isArray(g.blockReasons) || g.blockReasons.length > 0) return false;
  if (!Array.isArray(g.cautionReasons) || g.cautionReasons.length > 0) return false;
  return true;
}

/**
 * Writer / preflight no-op codes that must end in `skipped` (never `failed`) when writer returns `ok: false`.
 * Includes B5-A list plus common writer / eligibility codes.
 */
export const M56_B5_WRITER_NO_OP_SKIP_CODES = new Set<string>([
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

export function isM56B5WriterNoOpSkipReason(code: string | null | undefined): boolean {
  if (code == null || norm(String(code)) === "") {
    return true;
  }
  return M56_B5_WRITER_NO_OP_SKIP_CODES.has(norm(String(code)));
}

export type M56B5CliOpts = {
  limit: number;
  pretty: boolean;
  apply: boolean;
  /** True only when `--confirmControlledApply=I_UNDERSTAND` is present exactly. */
  confirmControlledApply: boolean;
};

export function parseM56B5ApplyArgs(argv: string[]): M56B5CliOpts {
  let limit = DEFAULT_LIMIT;
  let pretty = false;
  let apply = false;
  let confirmControlledApply = false;

  for (const a of argv) {
    if (a === "--pretty") {
      pretty = true;
      continue;
    }
    if (a === "--apply") {
      apply = true;
      continue;
    }
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (key === "limit") {
      limit = Number.parseInt(val, 10);
    } else if (key === "confirmControlledApply") {
      confirmControlledApply = val === M56_B5_CONFIRM_CONTROLLED_APPLY_VALUE;
    }
  }

  const n = Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_LIMIT;
  const clamped = Math.min(MAX_LIMIT, Math.max(1, n));
  return { limit: clamped, pretty, apply, confirmControlledApply };
}

export function printM56B5ApplyUsage(): void {
  // eslint-disable-next-line no-console
  console.log(`Usage: m56-b5-rrm-top2-hook-job-apply-cli.js [--limit=<1-${MAX_LIMIT}>] [--pretty] [--apply] [--confirmControlledApply=${M56_B5_CONFIRM_CONTROLLED_APPLY_VALUE}]
Default: dry-run (no --apply). Apply requires both --apply and exact --confirmControlledApply=... .
`);
}

export type M56B5ApplyRefused =
  | { refused: true; reason: "node_env_production" }
  | { refused: true; reason: "apply_confirmation_required"; hint: string };

export type M56B5DryRunItemSummary = {
  index: number;
  wouldProcess: boolean;
  wouldSkip: boolean;
  noOpReasonCode: string | null;
};

export type M56B5DryRunAggregateOk = {
  refused: false;
  mode: "dry_run";
  apply: false;
  sourceVersion: typeof M56_B5_RUNNER_SOURCE_VERSION;
  totalJobsRead: number;
  wouldProcessCount: number;
  wouldSkipCount: number;
  noOpReasonCounts: Record<string, number>;
  writerOkCount: number;
  writerNoOpCount: number;
  candidateUserIdUnchangedAll: true;
  finalScoreUnchangedAll: true;
  items: M56B5DryRunItemSummary[];
};

export type M56B5ApplyItemSummary = {
  index: number;
  outcome: "processed" | "skipped" | "failed";
  noOpReasonCode: string | null;
  errorCode: string | null;
};

export type M56B5ApplyAggregateOk = {
  refused: false;
  mode: "apply";
  apply: true;
  sourceVersion: typeof M56_B5_RUNNER_SOURCE_VERSION;
  totalJobsRead: number;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  noOpReasonCounts: Record<string, number>;
  candidateUserIdUnchangedAll: true;
  finalScoreUnchangedAll: true;
  items: M56B5ApplyItemSummary[];
};

export type M56B5ApplyRunnerResult = M56B5ApplyRefused | M56B5DryRunAggregateOk | M56B5ApplyAggregateOk;

export type M56B5ApplyRunnerPrisma = RrmTop2HookJobPrisma & WriteRrmTop2DisplayMetaForMatchResultPrisma;

export type M56B5ApplyRunnerDeps = {
  findPendingRrmTop2HookJobs: typeof findPendingRrmTop2HookJobs;
  processRrmTop2HookJobDryRun: typeof processRrmTop2HookJobDryRun;
  markRrmTop2HookJobProcessing: typeof markRrmTop2HookJobProcessing;
  markRrmTop2HookJobProcessed: typeof markRrmTop2HookJobProcessed;
  markRrmTop2HookJobSkipped: typeof markRrmTop2HookJobSkipped;
  markRrmTop2HookJobFailed: typeof markRrmTop2HookJobFailed;
  writeRrmTop2DisplayMetaForMatchResult: typeof writeRrmTop2DisplayMetaForMatchResult;
};

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function summarizeDryItem(r: ProcessRrmTop2HookJobDryRunResult, index: number): M56B5DryRunItemSummary {
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

async function runDryPath(
  prisma: M56B5ApplyRunnerPrisma,
  opts: M56B5CliOpts,
  deps: Partial<M56B5ApplyRunnerDeps>,
): Promise<M56B5DryRunAggregateOk> {
  const findPending = deps.findPendingRrmTop2HookJobs ?? findPendingRrmTop2HookJobs;
  const processDry = deps.processRrmTop2HookJobDryRun ?? processRrmTop2HookJobDryRun;
  const jobs = await findPending({ prisma, limit: opts.limit });

  const noOpReasonCounts: Record<string, number> = {};
  let wouldProcessCount = 0;
  let wouldSkipCount = 0;
  let writerOkCount = 0;
  let writerNoOpCount = 0;
  const items: M56B5DryRunItemSummary[] = [];

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    const r = await processDry({ prisma, job });
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
    sourceVersion: M56_B5_RUNNER_SOURCE_VERSION,
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

async function applyOneJob(
  prisma: M56B5ApplyRunnerPrisma,
  job: RrmTop2HookJobRow,
  index: number,
  deps: Partial<M56B5ApplyRunnerDeps>,
): Promise<M56B5ApplyItemSummary> {
  const markP = deps.markRrmTop2HookJobProcessing ?? markRrmTop2HookJobProcessing;
  const markOk = deps.markRrmTop2HookJobProcessed ?? markRrmTop2HookJobProcessed;
  const markSkip = deps.markRrmTop2HookJobSkipped ?? markRrmTop2HookJobSkipped;
  const markFail = deps.markRrmTop2HookJobFailed ?? markRrmTop2HookJobFailed;
  const writerFn = deps.writeRrmTop2DisplayMetaForMatchResult ?? writeRrmTop2DisplayMetaForMatchResult;

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

    if (wr.ok === true && wr.wroteMeta === true) {
      await markOk({
        prisma,
        jobId: job.id,
        metaWriteResult: viewerSafeProcessedMeta(wr),
      });
      return { index, outcome: "processed", noOpReasonCode: null, errorCode: null };
    }

    if (wr.ok === true && wr.wroteMeta !== true) {
      const code = "no_meta_write";
      await markSkip({
        prisma,
        jobId: job.id,
        noOpReasonCode: code,
        metaWriteResult: viewerSafeSkippedMeta(code),
      });
      return { index, outcome: "skipped", noOpReasonCode: code, errorCode: null };
    }

    const code =
      wr.noOpReasonCode != null && norm(String(wr.noOpReasonCode))
        ? norm(String(wr.noOpReasonCode))
        : "unknown_writer_noop";
    const meta = M56_B5_WRITER_NO_OP_SKIP_CODES.has(code)
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

async function runApplyPath(
  prisma: M56B5ApplyRunnerPrisma,
  opts: M56B5CliOpts,
  deps: Partial<M56B5ApplyRunnerDeps>,
): Promise<M56B5ApplyAggregateOk> {
  const findPending = deps.findPendingRrmTop2HookJobs ?? findPendingRrmTop2HookJobs;
  const jobs = await findPending({ prisma, limit: opts.limit });

  const items: M56B5ApplyItemSummary[] = [];
  const noOpReasonCounts: Record<string, number> = {};
  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    const row = await applyOneJob(prisma, job, i, deps);
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
    sourceVersion: M56_B5_RUNNER_SOURCE_VERSION,
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

/**
 * Dry-run (default) or controlled apply: pending → processing → processed | skipped | failed.
 */
export async function runM56B5HookJobApplyRunner(
  prisma: M56B5ApplyRunnerPrisma,
  opts: M56B5CliOpts,
  deps: Partial<M56B5ApplyRunnerDeps> = {},
): Promise<M56B5ApplyRunnerResult> {
  if (process.env.NODE_ENV === "production") {
    return { refused: true, reason: "node_env_production" };
  }

  if (opts.apply && !opts.confirmControlledApply) {
    return {
      refused: true,
      reason: "apply_confirmation_required",
      hint: `Re-run with --confirmControlledApply=${M56_B5_CONFIRM_CONTROLLED_APPLY_VALUE} (and keep --apply). No DB writes were performed.`,
    };
  }

  if (!opts.apply) {
    return runDryPath(prisma, opts, deps);
  }

  return runApplyPath(prisma, opts, deps);
}

export function formatM56B5ApplyOutput(result: M56B5ApplyRunnerResult, pretty: boolean): string {
  const space = pretty ? 2 : 0;
  return `${JSON.stringify(result, null, space)}\n`;
}
