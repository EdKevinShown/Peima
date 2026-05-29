/**
 * M5.6-B8-B — independent dry-run poller (dev/staging CLI): pending hook jobs → `processRrmTop2HookJobsDryRunAggregate` only.
 * See `docs/M5/M5.6-b8b-rrm-top2-independent-dry-run-poller-cli.md` and `docs/M5/M5.6-b8a-rrm-top2-independent-dry-run-poller-plan.md`.
 */
import {
  processRrmTop2HookJobsDryRunAggregate,
  type RrmTop2HookJobApplyDeps,
  type RrmTop2HookJobApplyDryRunAggregate,
  type RrmTop2HookJobApplyPrisma,
} from "../modules/matching/rrm-top2-hook-job-apply.service";

export const M56_B8_POLLER_SOURCE_VERSION = "m5.6-b8-rrm-top2-hook-job-dry-run-poller-v1" as const;

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

export type M56B8PollerCliOpts = {
  limit: number;
  pretty: boolean;
  /** B8-B only supports a single round; always true in JSON output. */
  once: true;
};

export type M56B8PollerParseFailureReason =
  | "apply_not_supported"
  | "apply_mode_not_supported"
  | "apply_semantic_flag_not_supported";

export type M56B8PollerParseResult =
  | { ok: true; opts: M56B8PollerCliOpts }
  | { ok: false; reason: M56B8PollerParseFailureReason };

function hasApplySemanticArgv(argv: string[]): M56B8PollerParseFailureReason | null {
  for (const a of argv) {
    if (a === "--apply" || a.startsWith("--apply=")) {
      return "apply_not_supported";
    }
    const modeM = /^--mode=(.*)$/.exec(a);
    if (modeM && modeM[1].trim().toLowerCase() === "apply") {
      return "apply_mode_not_supported";
    }
    if (a === "--confirmControlledApply" || a.startsWith("--confirmControlledApply=")) {
      return "apply_semantic_flag_not_supported";
    }
  }
  return null;
}

export function parseM56B8PollerArgs(argv: string[]): M56B8PollerParseResult {
  const applyReason = hasApplySemanticArgv(argv);
  if (applyReason) {
    return { ok: false, reason: applyReason };
  }

  let limit = DEFAULT_LIMIT;
  let pretty = false;
  for (const a of argv) {
    if (a === "--pretty") {
      pretty = true;
      continue;
    }
    if (a === "--once") {
      continue;
    }
    const m = /^--limit=(.*)$/.exec(a);
    if (m) {
      limit = Number.parseInt(m[1].trim(), 10);
    }
  }

  const n = Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_LIMIT;
  const clamped = Math.min(MAX_LIMIT, Math.max(1, n));
  return { ok: true, opts: { limit: clamped, pretty, once: true } };
}

export function printM56B8PollerUsage(): void {
  // eslint-disable-next-line no-console
  console.log(`Usage: m56-b8-rrm-top2-hook-job-dry-run-poller-cli.js [--limit=<1-${MAX_LIMIT}>] [--once] [--pretty]
M5.6-B8-B: dry-run poller only (shared service aggregate). No --apply, no hook status writes, no meta/summary.
Default limit=${DEFAULT_LIMIT}. This build always runs a single round (once=true).
`);
}

export type M56B8PollerRefused =
  | { refused: true; reason: "node_env_production" }
  | { refused: true; reason: M56B8PollerParseFailureReason };

export type M56B8DryRunPollerAggregateOk = RrmTop2HookJobApplyDryRunAggregate & {
  once: true;
  sourceVersion: typeof M56_B8_POLLER_SOURCE_VERSION;
};

export type M56B8PollerRunnerResult = M56B8PollerRefused | M56B8DryRunPollerAggregateOk;

export type M56B8PollerRunnerDeps = Partial<
  Pick<RrmTop2HookJobApplyDeps, "findPendingRrmTop2HookJobs" | "processRrmTop2HookJobDryRun">
>;

/**
 * Single-round dry-run poller: uses `processRrmTop2HookJobsDryRunAggregate` (no `mark*`, no apply writer).
 */
export async function runM56B8HookJobDryRunPoller(
  prisma: RrmTop2HookJobApplyPrisma,
  opts: M56B8PollerCliOpts,
  deps: M56B8PollerRunnerDeps = {},
): Promise<M56B8PollerRunnerResult> {
  if (process.env.NODE_ENV === "production") {
    return { refused: true, reason: "node_env_production" };
  }

  const aggregate = await processRrmTop2HookJobsDryRunAggregate({
    prisma,
    limit: opts.limit,
    sourceVersion: M56_B8_POLLER_SOURCE_VERSION,
    deps,
  });

  return {
    ...aggregate,
    sourceVersion: M56_B8_POLLER_SOURCE_VERSION,
    once: true,
  };
}

export function formatM56B8PollerOutput(result: M56B8PollerRunnerResult | M56B8PollerParseResult, pretty: boolean): string {
  const space = pretty ? 2 : 0;
  if ("ok" in result && !result.ok) {
    return `${JSON.stringify({ refused: true, reason: result.reason }, null, space)}\n`;
  }
  return `${JSON.stringify(result, null, space)}\n`;
}
