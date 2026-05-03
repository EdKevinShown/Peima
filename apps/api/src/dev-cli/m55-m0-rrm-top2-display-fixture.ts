/**
 * M5.5-M0 / M5.5-M0.1 — local dev-only fixture: `MatchResultRrmTop2DisplayMeta` ± optional
 * `matchInsights.rrmSimReadonlySummary` merge for `resolveMatchResultDisplay` verification (non-production).
 *
 * Default: dry-run. `--apply` writes DB. `--withRrmSummaryFixture` merges a viewer-safe summary
 * (M5.5-M0.1) before eligibility / meta upsert when combined with `--apply`.
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   node dist/dev-cli/m55-m0-rrm-top2-display-fixture.js --matchResultId=... --viewerUserId=... \\
 *     --selectedCandidateUserId=... --otherCandidateUserId=... [--top2Fingerprint=local-dev-fixture] \\
 *     [--withRrmSummaryFixture] [--apply]
 *
 * Requires `DATABASE_URL`. Set `PEIMA_M5_RRM_TOP2_ENABLED=1` when resolving RRM display branch.
 */
import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
  tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights,
} from "../modules/matching/matching-rrm-sim-readonly-summary";
import { buildM55RrmSimReadonlySummaryFixture, isM55FixtureBlockedInProduction } from "./m55-m0-rrm-summary-fixture.lib";
import { parseM55M0FixtureArgs, runM55M0RrmTop2DisplayFixture } from "./m55-m0-rrm-top2-display-fixture.runner";

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

function printUsage(): void {
  // eslint-disable-next-line no-console
  console.error(`Usage:
  node dist/dev-cli/m55-m0-rrm-top2-display-fixture.js \\
    --matchResultId=<id> --viewerUserId=<viewer> \\
    --selectedCandidateUserId=<rrm_winner> --otherCandidateUserId=<top2_other> \\
    [--top2Fingerprint=local-dev-fixture] [--withRrmSummaryFixture] [--apply]

  --viewerUserId must equal MatchResult.userId.
  MatchResult.candidateUserId must be one of { selectedCandidateUserId, otherCandidateUserId } (static Top2 baseline).
  selectedCandidateUserId is RRM display pick (newDisplayCandidateUserId).

  Default: dry-run (no DB write).
  --apply upserts match_result_rrm_top2_display_meta.
  --withRrmSummaryFixture merges viewer-safe rrmSimReadonlySummary into matchInsights (dry-run: preview only;
  with --apply: writes matchInsights first, then meta). Not a production writer.`);
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();

  if (isM55FixtureBlockedInProduction()) {
    // eslint-disable-next-line no-console
    console.error("Refused: NODE_ENV is production.");
    process.exit(1);
  }

  const opts = parseM55M0FixtureArgs(process.argv.slice(2));
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
    const result = await runM55M0RrmTop2DisplayFixture(opts, prisma);
    if ("error" in result) {
      // eslint-disable-next-line no-console
      console.error(result.error);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));

    if (result.mode === "dry_run" && !result.eligibility.ok) {
      // eslint-disable-next-line no-console
      console.warn(
        "[m55-m0] Eligibility not ok before write; GET may not return rrm_top2_bounded_selector until fixed.",
        result.eligibility.noOpReasonCode,
      );
      if (result.eligibility.noOpReasonCode === "rrm_summary_missing" && !opts.withRrmSummaryFixture) {
        const baselineRow = await prisma.matchResult.findUnique({ where: { id: opts.matchResultId } });
        const baseline = (baselineRow?.candidateUserId ?? "").trim();
        const summaryTemplate = buildM55RrmSimReadonlySummaryFixture(
          baseline,
          opts.selectedCandidateUserId,
          new Date().toISOString(),
        );
        // eslint-disable-next-line no-console
        console.warn(
          `[m55-m0] Merge under matchInsights.${RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY} a payload like "summaryTemplate" (winner = selected, baseline = MatchResult.candidateUserId), or pass --withRrmSummaryFixture:`,
        );
        // eslint-disable-next-line no-console
        console.warn(JSON.stringify({ summaryTemplate }, null, 2));
      }
    }

    if (result.mode === "dry_run") {
      // eslint-disable-next-line no-console
      console.log("[m55-m0] Dry-run only; pass --apply to upsert MatchResultRrmTop2DisplayMeta.");
    } else {
      // eslint-disable-next-line no-console
      console.log("[m55-m0] Apply completed.");
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

export { parseM55M0FixtureArgs as parseArgs, runM55M0RrmTop2DisplayFixture };
