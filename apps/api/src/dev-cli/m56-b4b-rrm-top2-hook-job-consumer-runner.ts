/**
 * M5.6-B4B — controlled dev/staging runner: read pending hook jobs, run `processRrmTop2HookJobDryRun` per row (read-only).
 * See `docs/M5/M5.6-b4b-rrm-top2-hook-job-consumer-runner.md`.
 */
import { findPendingRrmTop2HookJobs, type RrmTop2HookJobPrisma } from "../modules/matching/rrm-top2-hook-job.service";
import {
  processRrmTop2HookJobDryRun,
  type ProcessRrmTop2HookJobDryRunResult,
} from "../modules/matching/rrm-top2-hook-job-consumer";
import type { WriteRrmTop2DisplayMetaForMatchResultPrisma } from "../modules/matching/matching-rrm-top2-display-meta-writer";

export const M56_B4B_RUNNER_SOURCE_VERSION = "m5.6-b4b-rrm-top2-hook-job-consumer-runner-v1" as const;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export type M56B4bCliOpts = {
  limit: number;
  pretty: boolean;
};

export type M56B4bParseResult =
  | { ok: true; opts: M56B4bCliOpts }
  | { ok: false; reason: "apply_not_supported" };

export function parseM56B4bConsumerArgs(argv: string[]): M56B4bParseResult {
  for (const a of argv) {
    if (a === "--apply" || a.startsWith("--apply=")) {
      return { ok: false, reason: "apply_not_supported" };
    }
  }

  let limit = DEFAULT_LIMIT;
  let pretty = false;
  for (const a of argv) {
    if (a === "--pretty") {
      pretty = true;
      continue;
    }
    const m = /^--limit=(\d+)$/.exec(a);
    if (m) {
      limit = Number.parseInt(m[1], 10);
    }
  }

  const n = Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_LIMIT;
  const clamped = Math.min(MAX_LIMIT, Math.max(1, n));
  return { ok: true, opts: { limit: clamped, pretty } };
}

export function printM56B4bConsumerUsage(): void {
  // eslint-disable-next-line no-console
  console.log(`Usage: m56-b4b-rrm-top2-hook-job-consumer-cli.js [--limit=<1-${MAX_LIMIT}>] [--pretty]
M5.6-B4B: dry-run pending hook jobs only (no --apply, no status writes, no meta/summary).
`);
}

export type M56B4bConsumerRefused =
  | { refused: true; reason: "node_env_production" }
  | { refused: true; reason: "apply_not_supported" };

export type M56B4bConsumerItemSummary = {
  index: number;
  wouldProcess: boolean;
  wouldSkip: boolean;
  noOpReasonCode: string | null;
};

export type M56B4bConsumerAggregateOk = {
  refused: false;
  mode: "dry_run";
  /** Runner contract / JSON envelope version (not DB row ids). */
  sourceVersion: typeof M56_B4B_RUNNER_SOURCE_VERSION;
  totalJobsRead: number;
  wouldProcessCount: number;
  wouldSkipCount: number;
  noOpReasonCounts: Record<string, number>;
  writerOkCount: number;
  writerNoOpCount: number;
  candidateUserIdUnchangedAll: true;
  finalScoreUnchangedAll: true;
  items: M56B4bConsumerItemSummary[];
};

export type M56B4bConsumerRunnerResult = M56B4bConsumerRefused | M56B4bConsumerAggregateOk;

export type M56B4bConsumerRunnerDeps = {
  findPendingRrmTop2HookJobs: typeof findPendingRrmTop2HookJobs;
  processRrmTop2HookJobDryRun: typeof processRrmTop2HookJobDryRun;
};

/** Prisma slice used by findPending + consumer dry-run (no hook-job mutations). */
export type M56B4bConsumerRunnerPrisma = RrmTop2HookJobPrisma & WriteRrmTop2DisplayMetaForMatchResultPrisma;

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function summarizeItem(r: ProcessRrmTop2HookJobDryRunResult, index: number): M56B4bConsumerItemSummary {
  return {
    index,
    wouldProcess: r.wouldProcess,
    wouldSkip: r.wouldSkip,
    noOpReasonCode: r.noOpReasonCode,
  };
}

/**
 * Read pending hook jobs (limit), dry-run each via `processRrmTop2HookJobDryRun`. No status / meta / MatchResult writes.
 */
export async function runM56B4bHookJobConsumerDryRunRunner(
  prisma: M56B4bConsumerRunnerPrisma,
  opts: M56B4bCliOpts,
  deps: Partial<M56B4bConsumerRunnerDeps> = {},
): Promise<M56B4bConsumerRunnerResult> {
  if (process.env.NODE_ENV === "production") {
    return { refused: true, reason: "node_env_production" };
  }

  const findPending = deps.findPendingRrmTop2HookJobs ?? findPendingRrmTop2HookJobs;
  const processDry = deps.processRrmTop2HookJobDryRun ?? processRrmTop2HookJobDryRun;

  const jobs = await findPending({ prisma, limit: opts.limit });

  const noOpReasonCounts: Record<string, number> = {};
  let wouldProcessCount = 0;
  let wouldSkipCount = 0;
  let writerOkCount = 0;
  let writerNoOpCount = 0;
  const items: M56B4bConsumerItemSummary[] = [];

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    const r = await processDry({ prisma, job });
    items.push(summarizeItem(r, i));

    if (r.wouldProcess) {
      wouldProcessCount += 1;
    }
    if (r.wouldSkip) {
      wouldSkipCount += 1;
    }
    if (r.writerResult?.ok === true) {
      writerOkCount += 1;
    }
    if (r.writerResult != null && r.writerResult.ok === false) {
      writerNoOpCount += 1;
    }
    const code = r.noOpReasonCode;
    if (code) {
      bump(noOpReasonCounts, code);
    }
  }

  return {
    refused: false,
    mode: "dry_run",
    sourceVersion: M56_B4B_RUNNER_SOURCE_VERSION,
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

export function formatM56B4bConsumerOutput(result: M56B4bConsumerRunnerResult, pretty: boolean): string {
  const space = pretty ? 2 : 0;
  return `${JSON.stringify(result, null, space)}\n`;
}
