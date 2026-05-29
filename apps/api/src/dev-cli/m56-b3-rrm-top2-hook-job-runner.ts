/**
 * M5.6-B3 — controlled dev/staging runner to create `MatchResultRrmTop2DisplayHookJob` rows (no GET/worker/consumer/writer).
 * See `docs/M5/M5.6-b3-rrm-top2-hook-job-controlled-runner.md`.
 */
import type { PrismaService } from "../common/prisma/prisma.service";
import { createOrGetRrmTop2HookJob, type RrmTop2HookJobPrisma } from "../modules/matching/rrm-top2-hook-job.service";
import type { RrmTop2DisplayMetaGuardrailsV1 } from "../modules/matching/rrm-top2-display-meta.types";

export const M56_B3_HOOK_JOB_RUNNER_DEFAULT_SOURCE_VERSION = "m5.6-b3-rrm-top2-hook-job-v1" as const;
export const M56_B3_HOOK_JOB_RUNNER_DEFAULT_RRM_SOURCE_TYPE = "controlled_runner" as const;
const GUARDRAILS_CONTRACT_VERSION = "m5.6-b3-controlled-runner-guardrails-v1" as const;

function norm(s: string): string {
  return s.trim();
}

export type M56B3CliOpts = {
  matchResultId: string;
  viewerUserId: string;
  top2CandidateUserIdA: string;
  top2CandidateUserIdB: string;
  top2Fingerprint: string;
  sourceVersion: string;
  rrmSourceType: string;
  rrmSourceId: string | null;
  rrmSummarySourceVersion: string | null;
  guardrailsStatus: "pass" | "caution" | "block" | "not_evaluated";
  poolId: string | null;
  batchId: string | null;
  aiSimulationJobId: string | null;
  pairwiseJobId: string | null;
  apply: boolean;
  pretty: boolean;
};

export type M56B3HookRefused = {
  refused: true;
  reason: "node_env_production";
};

export type M56B3HookOutput = {
  refused: false;
  mode: "dry_run" | "apply";
  dryRun: boolean;
  apply: boolean;
  /** `null` when dry-run (no DB write). */
  created: boolean | null;
  jobId: string | null;
  status: string | null;
  sourceVersion: string;
  top2Fingerprint: string;
  guardrailsStatus: M56B3CliOpts["guardrailsStatus"];
  candidateUserIdUnchanged: true;
  finalScoreUnchanged: true;
  nextStepHint: string;
  preflightError?: string;
};

export function buildM56B3StaticTop2Snapshot(
  top2CandidateUserIdA: string,
  top2CandidateUserIdB: string,
  top2Fingerprint: string,
): Record<string, unknown> {
  return {
    kind: "rrm_top2_static_snapshot_v1",
    candidateUserIds: [norm(top2CandidateUserIdA), norm(top2CandidateUserIdB)],
    top2Fingerprint: norm(top2Fingerprint),
    source: M56_B3_HOOK_JOB_RUNNER_DEFAULT_RRM_SOURCE_TYPE,
  };
}

export function guardrailsFromM56B3CliStatus(
  status: M56B3CliOpts["guardrailsStatus"],
): RrmTop2DisplayMetaGuardrailsV1 {
  if (status === "pass") {
    return {
      status: "pass",
      blockReasons: [],
      cautionReasons: [],
      sourceVersion: GUARDRAILS_CONTRACT_VERSION,
    };
  }
  if (status === "caution") {
    return {
      status: "caution",
      blockReasons: [],
      cautionReasons: ["cli_controlled_caution"],
      sourceVersion: GUARDRAILS_CONTRACT_VERSION,
    };
  }
  if (status === "block") {
    return {
      status: "block",
      blockReasons: ["cli_controlled_block"],
      cautionReasons: [],
      sourceVersion: GUARDRAILS_CONTRACT_VERSION,
    };
  }
  return {
    status: "not_evaluated",
    blockReasons: [],
    cautionReasons: [],
    sourceVersion: GUARDRAILS_CONTRACT_VERSION,
  };
}

export function parseM56B3HookJobArgs(argv: string[]): M56B3CliOpts | null {
  let matchResultId = "";
  let viewerUserId = "";
  let top2CandidateUserIdA = "";
  let top2CandidateUserIdB = "";
  let top2Fingerprint = "";
  let sourceVersion: string = M56_B3_HOOK_JOB_RUNNER_DEFAULT_SOURCE_VERSION;
  let rrmSourceType: string = M56_B3_HOOK_JOB_RUNNER_DEFAULT_RRM_SOURCE_TYPE;
  let rrmSourceId: string | null = null;
  let rrmSummarySourceVersion: string | null = null;
  let guardrailsStatus: M56B3CliOpts["guardrailsStatus"] = "pass";
  let poolId: string | null = null;
  let batchId: string | null = null;
  let aiSimulationJobId: string | null = null;
  let pairwiseJobId: string | null = null;
  let apply = false;
  let pretty = false;

  for (const a of argv) {
    if (a === "--apply") {
      apply = true;
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
    else if (key === "viewerUserId") viewerUserId = val;
    else if (key === "top2CandidateUserIdA") top2CandidateUserIdA = val;
    else if (key === "top2CandidateUserIdB") top2CandidateUserIdB = val;
    else if (key === "top2Fingerprint") top2Fingerprint = val;
    else if (key === "sourceVersion") sourceVersion = val || M56_B3_HOOK_JOB_RUNNER_DEFAULT_SOURCE_VERSION;
    else if (key === "rrmSourceType") rrmSourceType = val || M56_B3_HOOK_JOB_RUNNER_DEFAULT_RRM_SOURCE_TYPE;
    else if (key === "rrmSourceId") rrmSourceId = val || null;
    else if (key === "rrmSummarySourceVersion") rrmSummarySourceVersion = val || null;
    else if (key === "poolId") poolId = val || null;
    else if (key === "batchId") batchId = val || null;
    else if (key === "aiSimulationJobId") aiSimulationJobId = val || null;
    else if (key === "pairwiseJobId") pairwiseJobId = val || null;
    else if (key === "guardrailsStatus") {
      const g = val.toLowerCase();
      if (g === "pass" || g === "caution" || g === "block" || g === "not_evaluated") {
        guardrailsStatus = g;
      }
    }
  }

  if (!norm(matchResultId) || !norm(viewerUserId) || !norm(top2CandidateUserIdA) || !norm(top2CandidateUserIdB) || !norm(top2Fingerprint)) {
    return null;
  }

  return {
    matchResultId: norm(matchResultId),
    viewerUserId: norm(viewerUserId),
    top2CandidateUserIdA: norm(top2CandidateUserIdA),
    top2CandidateUserIdB: norm(top2CandidateUserIdB),
    top2Fingerprint: norm(top2Fingerprint),
    sourceVersion: norm(sourceVersion) || M56_B3_HOOK_JOB_RUNNER_DEFAULT_SOURCE_VERSION,
    rrmSourceType: norm(rrmSourceType) || M56_B3_HOOK_JOB_RUNNER_DEFAULT_RRM_SOURCE_TYPE,
    rrmSourceId: rrmSourceId ? norm(rrmSourceId) : null,
    rrmSummarySourceVersion: rrmSummarySourceVersion ? norm(rrmSummarySourceVersion) : null,
    guardrailsStatus,
    poolId: poolId ? norm(poolId) : null,
    batchId: batchId ? norm(batchId) : null,
    aiSimulationJobId: aiSimulationJobId ? norm(aiSimulationJobId) : null,
    pairwiseJobId: pairwiseJobId ? norm(pairwiseJobId) : null,
    apply,
    pretty,
  };
}

export function printM56B3HookJobUsage(): void {
  // eslint-disable-next-line no-console
  console.log(`Usage: m56-b3-rrm-top2-hook-job-cli --matchResultId=<id> --viewerUserId=<id> \\
  --top2CandidateUserIdA=<id> --top2CandidateUserIdB=<id> --top2Fingerprint=<fp> \\
  [--sourceVersion=${M56_B3_HOOK_JOB_RUNNER_DEFAULT_SOURCE_VERSION}] [--rrmSourceType=${M56_B3_HOOK_JOB_RUNNER_DEFAULT_RRM_SOURCE_TYPE}] \\
  [--rrmSourceId=<id>] [--rrmSummarySourceVersion=<v>] [--guardrailsStatus=pass|caution|block|not_evaluated] \\
  [--poolId=<id>] [--batchId=<id>] [--aiSimulationJobId=<id>] [--pairwiseJobId=<id>] [--apply] [--pretty]
Default: dry-run (no DB). Pass --apply to persist hook job row. NODE_ENV=production is refused.`);
}

function toPrismaHookSubset(prisma: PrismaService): RrmTop2HookJobPrisma {
  return prisma as unknown as RrmTop2HookJobPrisma;
}

export async function runM56B3HookJobRunner(
  opts: M56B3CliOpts,
  prisma: PrismaService | null,
): Promise<M56B3HookRefused | M56B3HookOutput> {
  if (process.env.NODE_ENV === "production") {
    return { refused: true, reason: "node_env_production" };
  }

  const a = opts.top2CandidateUserIdA;
  const b = opts.top2CandidateUserIdB;
  if (a === b) {
    return {
      refused: false,
      mode: opts.apply ? "apply" : "dry_run",
      dryRun: !opts.apply,
      apply: opts.apply,
      created: null,
      jobId: null,
      status: null,
      sourceVersion: opts.sourceVersion,
      top2Fingerprint: opts.top2Fingerprint,
      guardrailsStatus: opts.guardrailsStatus,
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
      nextStepHint: "Fix: top2CandidateUserIdA and top2CandidateUserIdB must be two distinct ids.",
      preflightError: "top2_duplicate",
    };
  }

  const staticTop2Snapshot = buildM56B3StaticTop2Snapshot(a, b, opts.top2Fingerprint);
  const guardrails = guardrailsFromM56B3CliStatus(opts.guardrailsStatus);

  if (!opts.apply) {
    return {
      refused: false,
      mode: "dry_run",
      dryRun: true,
      apply: false,
      created: null,
      jobId: null,
      status: "pending",
      sourceVersion: opts.sourceVersion,
      top2Fingerprint: opts.top2Fingerprint,
      guardrailsStatus: opts.guardrailsStatus,
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
      nextStepHint: "Dry-run only; pass --apply to call createOrGetRrmTop2HookJob (requires DATABASE_URL + migration).",
    };
  }

  if (!prisma) {
    return {
      refused: false,
      mode: "apply",
      dryRun: false,
      apply: true,
      created: null,
      jobId: null,
      status: null,
      sourceVersion: opts.sourceVersion,
      top2Fingerprint: opts.top2Fingerprint,
      guardrailsStatus: opts.guardrailsStatus,
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
      nextStepHint: "Internal error: apply mode requires PrismaService instance.",
      preflightError: "prisma_missing",
    };
  }

  const r = await createOrGetRrmTop2HookJob({
    prisma: toPrismaHookSubset(prisma),
    matchResultId: opts.matchResultId,
    viewerUserId: opts.viewerUserId,
    sourceVersion: opts.sourceVersion,
    staticTop2Snapshot,
    top2Fingerprint: opts.top2Fingerprint,
    rrmSourceType: opts.rrmSourceType,
    rrmSourceId: opts.rrmSourceId,
    rrmSummarySourceVersion: opts.rrmSummarySourceVersion,
    guardrails,
    poolId: opts.poolId,
    batchId: opts.batchId,
    aiSimulationJobId: opts.aiSimulationJobId,
    pairwiseJobId: opts.pairwiseJobId,
    auditMeta: { runner: "m56-b3", guardrailsStatus: opts.guardrailsStatus },
  });

  return {
    refused: false,
    mode: "apply",
    dryRun: false,
    apply: true,
    created: r.created,
    jobId: r.job.id,
    status: r.job.status,
    sourceVersion: opts.sourceVersion,
    top2Fingerprint: opts.top2Fingerprint,
    guardrailsStatus: opts.guardrailsStatus,
    candidateUserIdUnchanged: true,
    finalScoreUnchanged: true,
    nextStepHint: r.created
      ? "Hook job created (pending). RRM display is not active until consumer + writer (later milestones)."
      : "Hook job row already existed for this (matchResultId, top2Fingerprint, sourceVersion); created=false.",
  };
}

export function formatM56B3HookJobOutput(result: M56B3HookRefused | M56B3HookOutput, pretty: boolean): string {
  if ("refused" in result && result.refused) {
    return JSON.stringify({ refused: true, reason: result.reason }, null, pretty ? 2 : undefined);
  }
  const o = result as M56B3HookOutput;
  const payload = {
    refused: false,
    mode: o.mode,
    dryRun: o.dryRun,
    apply: o.apply,
    created: o.created,
    jobId: o.jobId,
    status: o.status,
    sourceVersion: o.sourceVersion,
    top2Fingerprint: o.top2Fingerprint,
    guardrailsStatus: o.guardrailsStatus,
    candidateUserIdUnchanged: o.candidateUserIdUnchanged,
    finalScoreUnchanged: o.finalScoreUnchanged,
    nextStepHint: o.nextStepHint,
    ...(o.preflightError ? { preflightError: o.preflightError } : {}),
  };
  return JSON.stringify(payload, null, pretty ? 2 : undefined);
}
