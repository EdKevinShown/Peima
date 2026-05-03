/**
 * M5.6-B5-B — controlled apply gate runner for `MatchResultRrmTop2DisplayHookJob` (dev/staging CLI).
 * Core batch logic lives in `rrm-top2-hook-job-apply.service.ts` (M5.6-B7-B).
 * See `docs/M5/M5.6-b5b-rrm-top2-hook-job-apply-runner.md` and `docs/M5/M5.6-b5a-rrm-top2-hook-job-apply-gate-plan.md`.
 */
import type { WriteRrmTop2DisplayMetaForMatchResultPrisma } from "../modules/matching/matching-rrm-top2-display-meta-writer";
import type { RrmTop2HookJobPrisma } from "../modules/matching/rrm-top2-hook-job.service";
import {
  processRrmTop2HookJobsApplyBatch,
  processRrmTop2HookJobsDryRunAggregate,
  RRM_TOP2_HOOK_WRITER_NO_OP_SKIP_CODES,
  isRrmTop2HookWriterNoOpSkipReason,
  type RrmTop2HookJobApplyDeps,
  type RrmTop2HookJobApplyDryRunAggregate,
  type RrmTop2HookJobApplyBatchResult,
} from "../modules/matching/rrm-top2-hook-job-apply.service";

export const M56_B5_RUNNER_SOURCE_VERSION = "m5.6-b5-rrm-top2-hook-job-apply-runner-v1" as const;
export const M56_B5_CONFIRM_CONTROLLED_APPLY_VALUE = "I_UNDERSTAND" as const;

/** CLI / B5-C compatibility alias for `RRM_TOP2_HOOK_WRITER_NO_OP_SKIP_CODES`. */
export const M56_B5_WRITER_NO_OP_SKIP_CODES = RRM_TOP2_HOOK_WRITER_NO_OP_SKIP_CODES;

/** CLI / B5-C compatibility alias for `isRrmTop2HookWriterNoOpSkipReason`. */
export const isM56B5WriterNoOpSkipReason = isRrmTop2HookWriterNoOpSkipReason;

const DEFAULT_LIMIT = 1;
const MAX_LIMIT = 10;

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

export type M56B5DryRunItemSummary = RrmTop2HookJobApplyDryRunAggregate["items"][number];

export type M56B5DryRunAggregateOk = RrmTop2HookJobApplyDryRunAggregate & {
  sourceVersion: typeof M56_B5_RUNNER_SOURCE_VERSION;
};

export type M56B5ApplyItemSummary = RrmTop2HookJobApplyBatchResult["items"][number];

export type M56B5ApplyAggregateOk = RrmTop2HookJobApplyBatchResult & {
  sourceVersion: typeof M56_B5_RUNNER_SOURCE_VERSION;
};

export type M56B5ApplyRunnerResult = M56B5ApplyRefused | M56B5DryRunAggregateOk | M56B5ApplyAggregateOk;

export type M56B5ApplyRunnerPrisma = RrmTop2HookJobPrisma & WriteRrmTop2DisplayMetaForMatchResultPrisma;

export type M56B5ApplyRunnerDeps = RrmTop2HookJobApplyDeps;

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
    const dry = await processRrmTop2HookJobsDryRunAggregate({
      prisma,
      limit: opts.limit,
      sourceVersion: M56_B5_RUNNER_SOURCE_VERSION,
      deps,
    });
    return { ...dry, sourceVersion: M56_B5_RUNNER_SOURCE_VERSION };
  }

  const applied = await processRrmTop2HookJobsApplyBatch({
    prisma,
    limit: opts.limit,
    sourceVersion: M56_B5_RUNNER_SOURCE_VERSION,
    deps,
  });
  return { ...applied, sourceVersion: M56_B5_RUNNER_SOURCE_VERSION };
}

export function formatM56B5ApplyOutput(result: M56B5ApplyRunnerResult, pretty: boolean): string {
  const space = pretty ? 2 : 0;
  return `${JSON.stringify(result, null, space)}\n`;
}
