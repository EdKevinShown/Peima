/**
 * M5.5-M0 — local dev-only fixture: upsert `MatchResultRrmTop2DisplayMeta` for an existing `MatchResult`
 * to validate `resolveMatchResultDisplay` / `GET /matching/result` RRM Top2 path (non-production).
 *
 * Does **not** modify `MatchResult` rows (candidateUserId / finalScore / matchInsights).
 * For full `displaySourceType = rrm_top2_bounded_selector`, `matchInsights.rrmSimReadonlySummary` must
 * already satisfy `tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights` and align with meta
 * (see eligibility tests); merge via your own DB tooling or a simulation writer if missing.
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   node dist/dev-cli/m55-m0-rrm-top2-display-fixture.js --matchResultId=... --viewerUserId=... \\
 *     --selectedCandidateUserId=... --otherCandidateUserId=... [--top2Fingerprint=local-dev-fixture]
 *
 *   --apply     perform upsert (default: dry-run)
 *
 * Requires `DATABASE_URL`. Set `PEIMA_M5_RRM_TOP2_ENABLED=1` when calling `GET /matching/result` to observe RRM branch.
 */
import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Prisma } from "@peima/database";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import { RRM_SIM_SOURCE_VERSION } from "../modules/ai-simulation-v1/rrm-sim.constants";
import {
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
  tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights,
} from "../modules/matching/matching-rrm-sim-readonly-summary";
import { buildGuardrailsReadonly } from "../modules/matching/matching-guardrails-readonly";
import { resolveMatchResultDisplay } from "../modules/matching/matching-result-display";
import { parseMatchResultRrmTop2DisplayMetaV1Loose } from "../modules/matching/rrm-top2-display-meta.parser";
import { validateRrmTop2DisplayEligibility } from "../modules/matching/rrm-top2-display-eligibility";
import {
  MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
  MATCH_RESULT_RRM_TOP2_DISPLAY_META_SOURCE_TYPE,
} from "../modules/matching/rrm-top2-display-meta.types";

@Module({
  imports: [PrismaModule],
})
class M55M0FixtureModule {}

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [path.join(here, "../../.env"), path.join(here, "../../../.env")]) {
    dotenv.config({ path: p });
  }
}

function norm(s: string): string {
  return s.trim();
}

type CliOpts = {
  matchResultId: string;
  viewerUserId: string;
  selectedCandidateUserId: string;
  otherCandidateUserId: string;
  top2Fingerprint: string;
  apply: boolean;
};

function parseArgs(argv: string[]): CliOpts | null {
  let matchResultId = "";
  let viewerUserId = "";
  let selectedCandidateUserId = "";
  let otherCandidateUserId = "";
  let top2Fingerprint = "local-dev-fixture";
  let apply = false;

  for (const a of argv) {
    if (a === "--apply") {
      apply = true;
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

/** Same minimal shape as `matching-result-display-candidate.spec.ts` `rrmSimSummaryPayload`. */
function buildSummaryTemplateForConsole(winner: string, baseline: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sourceType: "rrm_sim_readonly_summary",
    sourceVersion: RRM_SIM_SOURCE_VERSION,
    candidateUserId: baseline,
    winnerUserId: winner,
    proposalCandidateUserId: winner,
    scenarioKey: null,
    suggestedAction: "maintain",
    progressionWindow: null,
    simulatedRhythmScore: 1,
    recommendation: "ok",
    confidenceBucket: "high",
    fallbackUsed: false,
    unavailableReason: null,
    cautionFlags: [],
    generatedAt: new Date().toISOString().slice(0, 19) + "Z",
    frozenAt: null,
  };
}

function printUsage(): void {
  // eslint-disable-next-line no-console
  console.error(`Usage:
  node dist/dev-cli/m55-m0-rrm-top2-display-fixture.js \\
    --matchResultId=<id> --viewerUserId=<viewer> \\
    --selectedCandidateUserId=<rrm_winner> --otherCandidateUserId=<top2_other> \\
    [--top2Fingerprint=local-dev-fixture] [--apply]

  --viewerUserId must equal MatchResult.userId.
  MatchResult.candidateUserId must be one of { selectedCandidateUserId, otherCandidateUserId } (static Top2 baseline).
  selectedCandidateUserId is RRM display pick (newDisplayCandidateUserId).

  Default: dry-run (no DB write). Pass --apply to upsert match_result_rrm_top2_display_meta only.

  This tool does not write MatchResult.matchInsights. If eligibility fails with rrm_summary_missing,
  merge a payload shaped like the printed "summaryTemplate" under key "${RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY}"
  (see matching-rrm-sim-readonly-summary.ts) using your own DB session.`);
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();

  if (process.env.NODE_ENV === "production") {
    // eslint-disable-next-line no-console
    console.error("Refused: NODE_ENV is production.");
    process.exit(1);
  }

  const opts = parseArgs(process.argv.slice(2));
  if (!opts) {
    printUsage();
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.error("DATABASE_URL missing; set in .env (repo root or apps/api).");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(M55M0FixtureModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const row = await prisma.matchResult.findUnique({ where: { id: opts.matchResultId } });
    if (!row) {
      // eslint-disable-next-line no-console
      console.error("MatchResult not found for --matchResultId.");
      process.exit(1);
    }
    if (row.userId !== opts.viewerUserId) {
      // eslint-disable-next-line no-console
      console.error("Refused: --viewerUserId does not equal MatchResult.userId.");
      process.exit(1);
    }

    const baseline = norm(row.candidateUserId);
    const sel = opts.selectedCandidateUserId;
    const oth = opts.otherCandidateUserId;
    if (sel === oth) {
      // eslint-disable-next-line no-console
      console.error("Refused: selected and other Top2 ids must differ.");
      process.exit(1);
    }
    if (oth === baseline) {
      // eslint-disable-next-line no-console
      console.error("Refused: --otherCandidateUserId must differ from MatchResult.candidateUserId (second Top2).");
      process.exit(1);
    }
    const top2Set = new Set([baseline, oth]);
    if (!top2Set.has(sel)) {
      // eslint-disable-next-line no-console
      console.error("Refused: --selectedCandidateUserId must be baseline or other Top2 member.");
      process.exit(1);
    }
    if (sel === baseline) {
      // eslint-disable-next-line no-console
      console.error(
        "Refused: resolver uses [baseline,newDisplay] as Top2 pair; selected === baseline duplicates Top2 for eligibility. Pick --selectedCandidateUserId = --otherCandidateUserId (RRM winner).",
      );
      process.exit(1);
    }

    const metaJson = buildRrmDisplayMetaJson({
      baselineCandidateUserId: baseline,
      newDisplayCandidateUserId: sel,
      top2Fingerprint: opts.top2Fingerprint,
    });

    const parsed = parseMatchResultRrmTop2DisplayMetaV1Loose(metaJson);
    if (!parsed) {
      // eslint-disable-next-line no-console
      console.error("Internal error: built meta failed parseMatchResultRrmTop2DisplayMetaV1Loose.");
      process.exit(1);
    }

    const summary = tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights(row.matchInsights);
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

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          mode: opts.apply ? "apply" : "dry_run",
          parseOk: true,
          eligibility: elig,
          prismaPayload: {
            matchResultId: opts.matchResultId,
            viewerUserId: opts.viewerUserId,
            schemaVersion: MATCH_RESULT_RRM_TOP2_DISPLAY_META_SCHEMA_VERSION,
            sourceVersion: metaJson.sourceVersion,
            top2Fingerprint: opts.top2Fingerprint,
            frozen: true,
            metaKeys: Object.keys(metaJson),
          },
        },
        null,
        2,
      ),
    );

    if (!elig.ok) {
      // eslint-disable-next-line no-console
      console.warn(
        "[m55-m0] Eligibility not ok before write; GET may not return rrm_top2_bounded_selector until fixed.",
        elig.noOpReasonCode,
      );
      if (elig.noOpReasonCode === "rrm_summary_missing") {
        // eslint-disable-next-line no-console
        console.warn(
          `[m55-m0] Merge under matchInsights.${RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY} a payload like "summaryTemplate" (winner = selected, baseline = MatchResult.candidateUserId):`,
        );
        // eslint-disable-next-line no-console
        console.warn(JSON.stringify({ summaryTemplate: buildSummaryTemplateForConsole(sel, baseline) }, null, 2));
      }
    }

    if (!opts.apply) {
      // eslint-disable-next-line no-console
      console.log("[m55-m0] Dry-run only; pass --apply to upsert MatchResultRrmTop2DisplayMeta.");
      return;
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

    // eslint-disable-next-line no-console
    console.log("[m55-m0] Upsert completed.");

    const row2 = await prisma.matchResult.findUnique({ where: { id: opts.matchResultId } });
    if (row2) {
      const display = await resolveMatchResultDisplay(prisma, row2);
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            resolveMatchResultDisplay: {
              displaySourceType: display.displaySourceType,
              displayCandidateUserId: display.displayCandidateUserId,
              finalMatchDecisionMetaIsNull: display.finalMatchDecisionMeta == null,
            },
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await app.close();
  }
}

void main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
