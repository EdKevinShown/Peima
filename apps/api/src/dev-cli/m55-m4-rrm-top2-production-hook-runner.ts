/**
 * M5.5-M4 — controlled production hook runner (dev/staging only).
 * Does **not** wire GET, worker, or simulation auto-completion. See `docs/M5/M5.5-m4-rrm-top2-production-hook-runner.md`.
 *
 * Top2 / fingerprint are **CLI-supplied** for controlled validation; M5.5-M5+ may read frozen DB sources instead.
 */
import type { PrismaService } from "../common/prisma/prisma.service";
import { buildM55RrmSimReadonlySummaryFixture, isM55FixtureBlockedInProduction } from "./m55-m0-rrm-summary-fixture.lib";
import {
  writeRrmTop2DisplayMetaForMatchResult,
  type WriteRrmTop2DisplayMetaForMatchResultPrisma,
  type WriteRrmTop2DisplayMetaForMatchResultResult,
} from "../modules/matching/matching-rrm-top2-display-meta-writer";
import type { RrmTop2DisplayMetaGuardrailsV1 } from "../modules/matching/rrm-top2-display-meta.types";
import { readM5RrmSimReadonlySummaryWriteEnabled } from "../modules/matching/matching-m5-rrm-sim-readonly-summary-write-env";
import { readM5RrmTop2MetaWriteEnabled } from "../modules/matching/matching-rrm-top2-display-meta-write-env";

const HOOK_SOURCE_VERSION = "m5.5-m4-production-hook-v1" as const;

function norm(s: string): string {
  return s.trim();
}

export type M55M4CliOpts = {
  matchResultId: string;
  top2CandidateUserIdA: string;
  top2CandidateUserIdB: string;
  rrmWinnerCandidateUserId: string;
  top2Fingerprint: string;
  guardrailsStatus: "pass" | "caution" | "block" | "not_evaluated";
  mergeSummary: boolean;
  apply: boolean;
  pretty: boolean;
};

export type M55M4HookRefused = {
  refused: true;
  reason: "node_env_production";
};

export type M55M4HookOutput = {
  refused: false;
  mode: "dry_run" | "apply";
  dryRun: boolean;
  ok: boolean;
  noOpReasonCode: string | null;
  wroteSummary: boolean;
  wroteMeta: boolean;
  sourceVersion: string;
  candidateUserIdUnchanged: boolean;
  finalScoreUnchanged: boolean;
  metaWriteEnvOn: boolean;
  summaryWriteEnvOn: boolean;
  nextVerificationHint: string;
  /** Early exit before writer (e.g. CLI validation). */
  preflightError?: string;
  /** Writer result passthrough when writer ran. */
  writer?: Pick<
    WriteRrmTop2DisplayMetaForMatchResultResult,
    "displayCandidateUserId" | "matchResultId"
  >;
};

export function parseM55M4ProductionHookArgs(argv: string[]): M55M4CliOpts | null {
  let matchResultId = "";
  let top2CandidateUserIdA = "";
  let top2CandidateUserIdB = "";
  let rrmWinnerCandidateUserId = "";
  let top2Fingerprint = "local-m55-m4-fp";
  let guardrailsStatus: M55M4CliOpts["guardrailsStatus"] = "pass";
  let mergeSummary = false;
  let apply = false;
  let pretty = false;

  for (const a of argv) {
    if (a === "--apply") {
      apply = true;
      continue;
    }
    if (a === "--mergeSummary") {
      mergeSummary = true;
      continue;
    }
    if (a === "--pretty") {
      pretty = true;
      continue;
    }
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (key === "matchResultId") matchResultId = val;
    else if (key === "top2CandidateUserIdA") top2CandidateUserIdA = val;
    else if (key === "top2CandidateUserIdB") top2CandidateUserIdB = val;
    else if (key === "rrmWinnerCandidateUserId") rrmWinnerCandidateUserId = val;
    else if (key === "top2Fingerprint") top2Fingerprint = val || "local-m55-m4-fp";
    else if (key === "guardrailsStatus") {
      const g = val.toLowerCase();
      if (g === "pass" || g === "caution" || g === "block" || g === "not_evaluated") {
        guardrailsStatus = g;
      }
    }
  }

  if (
    !norm(matchResultId) ||
    !norm(top2CandidateUserIdA) ||
    !norm(top2CandidateUserIdB) ||
    !norm(rrmWinnerCandidateUserId)
  ) {
    return null;
  }
  return {
    matchResultId: norm(matchResultId),
    top2CandidateUserIdA: norm(top2CandidateUserIdA),
    top2CandidateUserIdB: norm(top2CandidateUserIdB),
    rrmWinnerCandidateUserId: norm(rrmWinnerCandidateUserId),
    top2Fingerprint: norm(top2Fingerprint) || "local-m55-m4-fp",
    guardrailsStatus,
    mergeSummary,
    apply,
    pretty,
  };
}

export function guardrailsFromM55M4CliStatus(
  status: M55M4CliOpts["guardrailsStatus"],
): RrmTop2DisplayMetaGuardrailsV1 {
  const sourceVersion = "m5.5-m4-cli-guardrails-v1";
  if (status === "pass") {
    return { status: "pass", blockReasons: [], cautionReasons: [], sourceVersion };
  }
  if (status === "caution") {
    return {
      status: "caution",
      blockReasons: [],
      cautionReasons: ["cli_controlled_caution"],
      sourceVersion,
    };
  }
  if (status === "block") {
    return {
      status: "block",
      blockReasons: ["cli_controlled_block"],
      cautionReasons: [],
      sourceVersion,
    };
  }
  return {
    status: "not_evaluated",
    blockReasons: [],
    cautionReasons: [],
    sourceVersion,
  };
}

function baseOutput(partial: Partial<M55M4HookOutput> & Pick<M55M4HookOutput, "mode" | "dryRun">): M55M4HookOutput {
  return {
    refused: false,
    mode: partial.mode ?? "dry_run",
    dryRun: partial.dryRun ?? true,
    ok: partial.ok ?? false,
    noOpReasonCode: partial.noOpReasonCode ?? null,
    wroteSummary: partial.wroteSummary ?? false,
    wroteMeta: partial.wroteMeta ?? false,
    sourceVersion: partial.sourceVersion ?? HOOK_SOURCE_VERSION,
    candidateUserIdUnchanged: partial.candidateUserIdUnchanged ?? true,
    finalScoreUnchanged: partial.finalScoreUnchanged ?? true,
    metaWriteEnvOn: partial.metaWriteEnvOn ?? false,
    summaryWriteEnvOn: partial.summaryWriteEnvOn ?? false,
    nextVerificationHint: partial.nextVerificationHint ?? "",
    preflightError: partial.preflightError,
    writer: partial.writer,
  };
}

/**
 * Controlled hook: loads `MatchResult`, validates CLI Top2 vs baseline, optionally merges summary fixture, then calls writer.
 */
export async function runM55M4ProductionHook(
  opts: M55M4CliOpts,
  prisma: Pick<PrismaService, "matchResult" | "matchResultRrmTop2DisplayMeta" | "user">,
): Promise<M55M4HookRefused | M55M4HookOutput> {
  if (isM55FixtureBlockedInProduction()) {
    return { refused: true, reason: "node_env_production" };
  }

  const metaWriteEnvOn = readM5RrmTop2MetaWriteEnabled();
  const summaryWriteEnvOn = readM5RrmSimReadonlySummaryWriteEnabled();
  const dryRun = !opts.apply;
  const mode: M55M4HookOutput["mode"] = opts.apply ? "apply" : "dry_run";

  const hintOk =
    "Enable PEIMA_M5_RRM_TOP2_ENABLED and call GET /matching/result read-only to confirm displaySourceType when sidecar and summary are present.";
  const hintEnv =
    "Set PEIMA_M5_RRM_TOP2_META_WRITE_ENABLED=1 for meta writes; use PEIMA_M5_RRM_SIM_READONLY_SUMMARY_WRITE_ENABLED=1 when using --mergeSummary on apply.";

  const row = await prisma.matchResult.findUnique({ where: { id: opts.matchResultId } });
  if (!row) {
    return baseOutput({
      mode,
      dryRun,
      ok: false,
      noOpReasonCode: "match_result_missing",
      wroteSummary: false,
      wroteMeta: false,
      sourceVersion: HOOK_SOURCE_VERSION,
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
      metaWriteEnvOn,
      summaryWriteEnvOn,
      nextVerificationHint: "Ensure --matchResultId refers to an existing row before apply.",
    });
  }

  const baseline = norm(row.candidateUserId);
  const a = opts.top2CandidateUserIdA;
  const b = opts.top2CandidateUserIdB;
  const set = new Set([a, b]);
  if (!set.has(baseline)) {
    return baseOutput({
      mode,
      dryRun,
      ok: false,
      noOpReasonCode: "baseline_mismatch",
      metaWriteEnvOn,
      summaryWriteEnvOn,
      nextVerificationHint: "Top2 pair must include MatchResult static baseline (candidateUserId).",
      preflightError: "Refused: static Top2 must include MatchResult.candidateUserId.",
    });
  }
  if (a === b) {
    return baseOutput({
      mode,
      dryRun,
      ok: false,
      noOpReasonCode: "top2_duplicate",
      metaWriteEnvOn,
      summaryWriteEnvOn,
      nextVerificationHint: "Provide two distinct Top2 user ids.",
      preflightError: "Refused: top2 candidates must be distinct.",
    });
  }
  if (!set.has(opts.rrmWinnerCandidateUserId)) {
    return baseOutput({
      mode,
      dryRun,
      ok: false,
      noOpReasonCode: "cli_winner_not_in_static_top2",
      metaWriteEnvOn,
      summaryWriteEnvOn,
      nextVerificationHint: "Winner must be one of the two Top2 ids.",
      preflightError: "Refused: --rrmWinnerCandidateUserId must be one of the Top2 pair.",
    });
  }

  if (opts.mergeSummary && !summaryWriteEnvOn && opts.apply) {
    return baseOutput({
      mode,
      dryRun,
      ok: false,
      noOpReasonCode: "summary_write_disabled",
      metaWriteEnvOn,
      summaryWriteEnvOn,
      nextVerificationHint: hintEnv,
      preflightError: "Refused: --mergeSummary on apply requires PEIMA_M5_RRM_SIM_READONLY_SUMMARY_WRITE_ENABLED.",
    });
  }

  const guardrails = guardrailsFromM55M4CliStatus(opts.guardrailsStatus);

  const payload =
    opts.mergeSummary
      ? buildM55RrmSimReadonlySummaryFixture(baseline, opts.rrmWinnerCandidateUserId, new Date().toISOString())
      : undefined;

  const prismaWriter = prisma as unknown as WriteRrmTop2DisplayMetaForMatchResultPrisma;
  const writerResult = await writeRrmTop2DisplayMetaForMatchResult({
    prisma: prismaWriter,
    matchResultId: opts.matchResultId,
    staticTop2CandidateUserIds: [a, b] as const,
    top2Fingerprint: opts.top2Fingerprint,
    guardrails,
    sourceVersion: HOOK_SOURCE_VERSION,
    dryRun,
    rrmSimReadonlySummaryPayload: payload,
  });

  return baseOutput({
    mode,
    dryRun,
    ok: writerResult.ok,
    noOpReasonCode: writerResult.noOpReasonCode,
    wroteSummary: writerResult.wroteSummary,
    wroteMeta: writerResult.wroteMeta,
    sourceVersion: writerResult.sourceVersion ?? HOOK_SOURCE_VERSION,
    candidateUserIdUnchanged: writerResult.candidateUserIdUnchanged,
    finalScoreUnchanged: writerResult.finalScoreUnchanged,
    metaWriteEnvOn,
    summaryWriteEnvOn,
    nextVerificationHint: writerResult.ok ? hintOk : hintEnv,
    writer: {
      matchResultId: writerResult.matchResultId,
      displayCandidateUserId: writerResult.displayCandidateUserId,
    },
  });
}

export function formatM55M4HookOutput(out: M55M4HookRefused | M55M4HookOutput, pretty: boolean): string {
  return JSON.stringify(out, null, pretty ? 2 : 0);
}

export function printM55M4Usage(): void {
  // eslint-disable-next-line no-console
  console.error(`Usage:
  node dist/dev-cli/m55-m4-rrm-top2-production-hook-cli.js \\
    --matchResultId=<id> --top2CandidateUserIdA=<id> --top2CandidateUserIdB=<id> \\
    --rrmWinnerCandidateUserId=<id> --top2Fingerprint=<fp> \\
    [--guardrailsStatus=pass|caution|block|not_evaluated] [--mergeSummary] [--apply] [--pretty]

  Refused when NODE_ENV=production. Default dry-run; --apply writes when env gates allow.
  Manual Top2 is for controlled validation only; frozen DB Top2 wiring is deferred to M5.5-M5+.`);
}
