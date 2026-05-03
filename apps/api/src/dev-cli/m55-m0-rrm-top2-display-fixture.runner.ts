/**
 * M5.5-M0 / M5.5-M0.1 fixture runner (dev-only). Used by CLI and tests — no Nest bootstrap.
 */
import type { Prisma } from "@peima/database";
import type { MatchResult, PrismaClient } from "@peima/database";
import { buildGuardrailsReadonly } from "../modules/matching/matching-guardrails-readonly";
import {
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
  tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights,
} from "../modules/matching/matching-rrm-sim-readonly-summary";
import { resolveMatchResultDisplay } from "../modules/matching/matching-result-display";
import { parseMatchResultRrmTop2DisplayMetaV1Loose } from "../modules/matching/rrm-top2-display-meta.parser";
import { validateRrmTop2DisplayEligibility } from "../modules/matching/rrm-top2-display-eligibility";
import {
  MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
  MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
} from "../modules/matching/rrm-top2-display-meta.types";
import {
  buildM55RrmSimReadonlySummaryFixture,
  mergeM55RrmSummaryFixtureIntoInsights,
} from "./m55-m0-rrm-summary-fixture.lib";
import type { PrismaService } from "../common/prisma/prisma.service";

export type M55M0CliOpts = {
  matchResultId: string;
  viewerUserId: string;
  selectedCandidateUserId: string;
  otherCandidateUserId: string;
  top2Fingerprint: string;
  apply: boolean;
  withRrmSummaryFixture: boolean;
};

export type M55M0DryRunBaseResult = {
  mode: "dry_run";
  parseOk: true;
  eligibility: ReturnType<typeof validateRrmTop2DisplayEligibility>;
  prismaPayload: {
    matchResultId: string;
    viewerUserId: string;
    schemaVersion: typeof MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION;
    sourceVersion: unknown;
    top2Fingerprint: string;
    frozen: boolean;
    metaKeys: string[];
  };
};

export type M55M0DryRunWithSummaryFixtureResult = M55M0DryRunBaseResult & {
  withRrmSummaryFixture: true;
  wouldWriteMatchInsightsSummary: boolean;
  parserValid: boolean;
  rrmSummaryParseValid: boolean;
  eligibilityEligible: boolean;
  noOpReasonCode: string | null;
  nextCommand: string;
};

export type M55M0ApplyResult = {
  mode: "apply";
  appliedRrmSummaryFixture: boolean;
  appliedRrmTop2DisplayMeta: boolean;
  displaySourceTypeAfterResolve: string | null;
  displayCandidateUserIdAfterResolve: string | null;
  doesNotModifyCandidateUserId: boolean;
  doesNotModifyFinalScore: boolean;
};

export type M55M0FixtureRunResult =
  | { error: string }
  | M55M0DryRunBaseResult
  | M55M0DryRunWithSummaryFixtureResult
  | M55M0ApplyResult;

function norm(s: string): string {
  return s.trim();
}

export function parseM55M0FixtureArgs(argv: string[]): M55M0CliOpts | null {
  let matchResultId = "";
  let viewerUserId = "";
  let selectedCandidateUserId = "";
  let otherCandidateUserId = "";
  let top2Fingerprint = "local-dev-fixture";
  let apply = false;
  let withRrmSummaryFixture = false;

  for (const a of argv) {
    if (a === "--apply") {
      apply = true;
      continue;
    }
    if (a === "--withRrmSummaryFixture") {
      withRrmSummaryFixture = true;
      continue;
    }
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (key === "matchResultId") matchResultId = val;
    else if (key === "viewerUserId") viewerUserId = val;
    else if (key === "selectedCandidateUserId") selectedCandidateUserId = val;
    else if (key === "otherCandidateUserId") otherCandidateUserId = val;
    else if (key === "top2Fingerprint") top2Fingerprint = val || "local-dev-fixture";
  }

  if (!norm(matchResultId) || !norm(viewerUserId) || !norm(selectedCandidateUserId) || !norm(otherCandidateUserId)) {
    return null;
  }
  return {
    matchResultId: norm(matchResultId),
    viewerUserId: norm(viewerUserId),
    selectedCandidateUserId: norm(selectedCandidateUserId),
    otherCandidateUserId: norm(otherCandidateUserId),
    top2Fingerprint: norm(top2Fingerprint) || "local-dev-fixture",
    apply,
    withRrmSummaryFixture,
  };
}

function buildRrmDisplayMetaJson(args: {
  baselineCandidateUserId: string;
  newDisplayCandidateUserId: string;
  top2Fingerprint: string;
}): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  return {
    schemaVersion: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
    sourceType: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
    sourceVersion: "m5.3-c1-rrm-top2-display-meta-v1",
    baselineCandidateUserId: args.baselineCandidateUserId,
    previousDisplayCandidateUserId: args.baselineCandidateUserId,
    newDisplayCandidateUserId: args.newDisplayCandidateUserId,
    decisionRule: "rrm_top2_winner_guardrails_pass",
    top2Fingerprint: args.top2Fingerprint,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    rollbackAvailable: true,
    frozenAt: nowIso,
  };
}

function validateTop2Args(row: MatchResult, opts: M55M0CliOpts): { ok: true; baseline: string } | { ok: false; message: string } {
  if (row.userId !== opts.viewerUserId) {
    return { ok: false, message: "Refused: --viewerUserId does not equal MatchResult.userId." };
  }
  const baseline = norm(row.candidateUserId);
  const sel = opts.selectedCandidateUserId;
  const oth = opts.otherCandidateUserId;
  if (oth === baseline) {
    return { ok: false, message: "Refused: --otherCandidateUserId must differ from MatchResult.candidateUserId (second Top2)." };
  }
  const top2Set = new Set([baseline, oth]);
  if (!top2Set.has(sel)) {
    return { ok: false, message: "Refused: --selectedCandidateUserId must be baseline or other Top2 member." };
  }
  if (sel === baseline) {
    return {
      ok: false,
      message:
        "Refused: resolver uses [baseline,newDisplay] as Top2 pair; selected === baseline duplicates Top2 for eligibility. Pick --selectedCandidateUserId = --otherCandidateUserId (RRM winner).",
    };
  }
  return { ok: true, baseline };
}

/**
 * Core fixture flow: validate row, optional summary merge preview/write, meta upsert, resolve display.
 * Caller checks `isM55FixtureBlockedInProduction()` and `DATABASE_URL`.
 */
export async function runM55M0RrmTop2DisplayFixture(
  opts: M55M0CliOpts,
  prisma: Pick<PrismaClient, "matchResult" | "matchResultRrmTop2DisplayMeta" | "user" | "pairwisePoolFinalizeMeta">,
  clock: { nowIso: () => string } = { nowIso: () => new Date().toISOString() },
): Promise<M55M0FixtureRunResult> {
  const row = await prisma.matchResult.findUnique({ where: { id: opts.matchResultId } });
  if (!row) {
    return { error: "MatchResult not found for --matchResultId." };
  }
  const v = validateTop2Args(row, opts);
  if (!v.ok) {
    return { error: v.message };
  }
  const baseline = v.baseline;
  const sel = opts.selectedCandidateUserId;

  const metaJson = buildRrmDisplayMetaJson({
    baselineCandidateUserId: baseline,
    newDisplayCandidateUserId: sel,
    top2Fingerprint: opts.top2Fingerprint,
  });
  const parsed = parseMatchResultRrmTop2DisplayMetaV1Loose(metaJson);
  if (!parsed) {
    return { error: "Internal error: built meta failed parseMatchResultRrmTop2DisplayMetaV1Loose." };
  }

  const generatedAtIso = clock.nowIso();
  const insightsForParse = opts.withRrmSummaryFixture
    ? mergeM55RrmSummaryFixtureIntoInsights(row.matchInsights, baseline, sel, generatedAtIso)
    : row.matchInsights;

  const summary = tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights(insightsForParse);
  const guardrails = buildGuardrailsReadonly(null, row);
  const elig = validateRrmTop2DisplayEligibility({
    m5RrmTop2Enabled: true,
    matchResultCandidateUserId: row.candidateUserId,
    top2CandidateUserIds: [parsed.baselineCandidateUserId.trim(), parsed.newDisplayCandidateUserId.trim()] as const,
    top2Fingerprint: parsed.top2Fingerprint.trim(),
    rrmDisplayMeta: parsed,
    rowTop2Fingerprint: opts.top2Fingerprint,
    rrmSimReadonlySummary: summary,
    guardrailsReadonly: guardrails,
  });

  const prismaPayload = {
    matchResultId: opts.matchResultId,
    viewerUserId: opts.viewerUserId,
    schemaVersion: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
    sourceVersion: metaJson.sourceVersion,
    top2Fingerprint: opts.top2Fingerprint,
    frozen: true,
    metaKeys: Object.keys(metaJson),
  };

  const baseDry: M55M0DryRunBaseResult = {
    mode: "dry_run",
    parseOk: true,
    eligibility: elig,
    prismaPayload,
  };

  if (!opts.apply) {
    if (opts.withRrmSummaryFixture) {
      const rrmSummaryParseValid = summary != null;
      const out: M55M0DryRunWithSummaryFixtureResult = {
        ...baseDry,
        withRrmSummaryFixture: true,
        wouldWriteMatchInsightsSummary: rrmSummaryParseValid,
        parserValid: true,
        rrmSummaryParseValid,
        eligibilityEligible: elig.ok,
        noOpReasonCode: elig.ok ? null : elig.noOpReasonCode,
        nextCommand:
          "pnpm run m55-m0:rrm-top2-display-fixture -- --matchResultId <local_match_result_id> --viewerUserId <local_viewer_user_id> --selectedCandidateUserId <local_candidate_b> --otherCandidateUserId <local_candidate_a> --withRrmSummaryFixture --apply",
      };
      return out;
    }
    return baseDry;
  }

  /** apply */
  const snapshotCandidate = row.candidateUserId;
  const snapshotFinalScore = row.finalScore;
  let appliedRrmSummaryFixture = false;

  if (opts.withRrmSummaryFixture) {
    if (!summary) {
      return { error: "Refused: merged rrmSimReadonlySummary fixture failed parser; not writing matchInsights." };
    }
    const merged = mergeM55RrmSummaryFixtureIntoInsights(row.matchInsights, baseline, sel, generatedAtIso);
    await prisma.matchResult.update({
      where: { id: opts.matchResultId },
      data: { matchInsights: merged as Prisma.InputJsonValue },
    });
    appliedRrmSummaryFixture = true;
  }

  await prisma.matchResultRrmTop2DisplayMeta.upsert({
    where: { matchResultId: opts.matchResultId },
    create: {
      matchResultId: opts.matchResultId,
      viewerUserId: opts.viewerUserId,
      schemaVersion: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
      sourceVersion: String(metaJson.sourceVersion),
      top2Fingerprint: opts.top2Fingerprint,
      frozen: true,
      frozenAt: new Date(),
      meta: metaJson as Prisma.InputJsonValue,
    },
    update: {
      viewerUserId: opts.viewerUserId,
      schemaVersion: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
      sourceVersion: String(metaJson.sourceVersion),
      top2Fingerprint: opts.top2Fingerprint,
      frozen: true,
      frozenAt: new Date(),
      meta: metaJson as Prisma.InputJsonValue,
    },
  });

  const row2 = await prisma.matchResult.findUnique({ where: { id: opts.matchResultId } });
  if (!row2) {
    return { error: "MatchResult missing after apply." };
  }

  const doesNotModifyCandidateUserId = row2.candidateUserId === snapshotCandidate;
  const doesNotModifyFinalScore = row2.finalScore === snapshotFinalScore;
  const display = await resolveMatchResultDisplay(prisma as unknown as PrismaService, row2);

  return {
    mode: "apply",
    appliedRrmSummaryFixture,
    appliedRrmTop2DisplayMeta: true,
    displaySourceTypeAfterResolve: display.displaySourceType,
    displayCandidateUserIdAfterResolve: display.displayCandidateUserId,
    doesNotModifyCandidateUserId,
    doesNotModifyFinalScore,
  };
}

/** For tests: serialized fixture must not leak obvious viewer-unsafe tokens. */
export function m55FixtureSummaryJsonExcludesForbiddenTokens(summary: ReturnType<typeof buildM55RrmSimReadonlySummaryFixture>): boolean {
  const s = JSON.stringify(summary).toLowerCase();
  for (const f of ["formula", "transcript", "prompt"]) {
    if (s.includes(f)) return false;
  }
  return true;
}

export { RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY };
