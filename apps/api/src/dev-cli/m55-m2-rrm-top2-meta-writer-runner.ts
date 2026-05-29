/**
 * M5.5-M2 — controlled dev runner for `writeRrmTop2DisplayMetaForMatchResult` (not production pipeline).
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   node dist/dev-cli/m55-m2-rrm-top2-meta-writer-cli.js \\
 *     --matchResultId=<id> --top2CandidateUserIdA=<id> --top2CandidateUserIdB=<id> \\
 *     --rrmWinnerCandidateUserId=<id> --top2Fingerprint=<fp> [--mergeSummary] [--apply]
 *
 * Default: dry-run (no DB writes). `--apply` persists summary (when `--mergeSummary`) then meta.
 * Requires `DATABASE_URL`, `PEIMA_M5_RRM_TOP2_META_WRITE_ENABLED=1`; `--mergeSummary` also needs
 * `PEIMA_M5_RRM_SIM_READONLY_SUMMARY_WRITE_ENABLED=1`.
 */
import type { PrismaService } from "../common/prisma/prisma.service";
import { buildM55RrmSimReadonlySummaryFixture, isM55FixtureBlockedInProduction } from "./m55-m0-rrm-summary-fixture.lib";
import { writeRrmTop2DisplayMetaForMatchResult } from "../modules/matching/matching-rrm-top2-display-meta-writer";
import type { RrmTop2DisplayMetaGuardrailsV1 } from "../modules/matching/rrm-top2-display-meta.types";

function norm(s: string): string {
  return s.trim();
}

export type M55M2CliOpts = {
  matchResultId: string;
  top2CandidateUserIdA: string;
  top2CandidateUserIdB: string;
  rrmWinnerCandidateUserId: string;
  top2Fingerprint: string;
  mergeSummary: boolean;
  apply: boolean;
};

export function parseM55M2WriterArgs(argv: string[]): M55M2CliOpts | null {
  let matchResultId = "";
  let top2CandidateUserIdA = "";
  let top2CandidateUserIdB = "";
  let rrmWinnerCandidateUserId = "";
  let top2Fingerprint = "local-m55-m2-fp";
  let mergeSummary = false;
  let apply = false;

  for (const a of argv) {
    if (a === "--apply") {
      apply = true;
      continue;
    }
    if (a === "--mergeSummary") {
      mergeSummary = true;
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
    else if (key === "top2Fingerprint") top2Fingerprint = val || "local-m55-m2-fp";
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
    top2Fingerprint: norm(top2Fingerprint) || "local-m55-m2-fp",
    mergeSummary,
    apply,
  };
}

const DEFAULT_CLI_GUARDRAILS: RrmTop2DisplayMetaGuardrailsV1 = {
  status: "pass",
  blockReasons: [],
  cautionReasons: [],
  sourceVersion: "m5.5-m2-cli-guardrails-v1",
};

export async function runM55M2RrmTop2MetaWriter(
  opts: M55M2CliOpts,
  prisma: Pick<PrismaService, "matchResult" | "matchResultRrmTop2DisplayMeta" | "user">,
): Promise<unknown> {
  const row = await prisma.matchResult.findUnique({ where: { id: opts.matchResultId } });
  if (!row) {
    return { error: "MatchResult not found for --matchResultId." };
  }
  const baseline = norm(row.candidateUserId);
  const a = opts.top2CandidateUserIdA;
  const b = opts.top2CandidateUserIdB;
  const set = new Set([a, b]);
  if (!set.has(baseline)) {
    return { error: "Refused: static Top2 must include MatchResult.candidateUserId." };
  }
  if (a === b) {
    return { error: "Refused: top2 candidates must be distinct." };
  }
  if (!set.has(opts.rrmWinnerCandidateUserId)) {
    return { error: "Refused: --rrmWinnerCandidateUserId must be one of the Top2 pair." };
  }

  const payload =
    opts.mergeSummary
      ? buildM55RrmSimReadonlySummaryFixture(baseline, opts.rrmWinnerCandidateUserId, new Date().toISOString())
      : undefined;

  return writeRrmTop2DisplayMetaForMatchResult({
    prisma,
    matchResultId: opts.matchResultId,
    staticTop2CandidateUserIds: [a, b] as const,
    top2Fingerprint: opts.top2Fingerprint,
    guardrails: DEFAULT_CLI_GUARDRAILS,
    sourceVersion: "m5.5-m2-cli-v1",
    dryRun: !opts.apply,
    rrmSimReadonlySummaryPayload: payload,
  });
}

export function printM55M2Usage(): void {
  // eslint-disable-next-line no-console
  console.error(`Usage:
  node dist/dev-cli/m55-m2-rrm-top2-meta-writer-cli.js \\
    --matchResultId=<id> --top2CandidateUserIdA=<id> --top2CandidateUserIdB=<id> \\
    --rrmWinnerCandidateUserId=<id> --top2Fingerprint=<fp> [--mergeSummary] [--apply]

  A/B must be the static Top2 (include MatchResult.candidateUserId). Winner must be A or B.
  Refused when NODE_ENV=production. Default dry-run; --apply writes DB.`);
}
