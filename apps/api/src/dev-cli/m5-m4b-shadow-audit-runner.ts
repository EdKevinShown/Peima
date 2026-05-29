/**
 * M5.2-M4B — read-only shadow audit CLI (admin / developer).
 *
 * Fetches the latest N `MatchResult` rows, resolves display like `GET /matching/result`,
 * builds `multiSourceFinalDecision` with **shadowEnabled: true** (forced for audit), then
 * aggregates via `buildM5ShadowAuditSummary`. Prints JSON to stdout only — no IDs, no files, no writes.
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   node dist/dev-cli/m5-m4b-shadow-audit-runner.js
 *   node dist/dev-cli/m5-m4b-shadow-audit-runner.js --limit 50
 *   node dist/dev-cli/m5-m4b-shadow-audit-runner.js --limit=20 --pretty
 *
 * Requires `DATABASE_URL` (load `.env` from `apps/api` or monorepo root).
 */
import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  buildM5ShadowAuditSummary,
  M5_SHADOW_AUDIT_SOURCE_VERSION,
  type M5ShadowAuditInputItem,
} from "../modules/matching/matching-m5-shadow-audit";
import { buildMultiSourceFinalDecisionReadonlyM51M0 } from "../modules/matching/matching-multi-source-final-decision-m51m0";
import { resolveMatchResultDisplay } from "../modules/matching/matching-result-display";
import { parseM5M4bShadowAuditCliArgs } from "./m5-m4b-shadow-audit-cli-args";

export const M5_M4B_SHADOW_AUDIT_RUNNER_SOURCE_VERSION = "m5.2-m4b-shadow-audit-cli-v1" as const;

@Module({
  imports: [PrismaModule],
})
class M5ShadowAuditRunnerModule {}

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  const candidates = [
    path.join(here, "../../.env"),
    path.join(here, "../../../.env"),
  ];
  for (const p of candidates) {
    dotenv.config({ path: p });
  }
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();
  const { limit, pretty } = parseM5M4bShadowAuditCliArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.error("DATABASE_URL missing; set in .env (repo root or apps/api).");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(M5ShadowAuditRunnerModule, {
    logger: false,
  });
  try {
    const prisma = app.get(PrismaService);
    const rows = await prisma.matchResult.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    const auditItems: M5ShadowAuditInputItem[] = [];
    for (const row of rows) {
      const display = await resolveMatchResultDisplay(prisma, row);
      const multiSourceFinalDecision = buildMultiSourceFinalDecisionReadonlyM51M0(row, display, {
        shadowEnabled: true,
      });
      auditItems.push({ multiSourceFinalDecision });
    }

    const auditRunAt = new Date().toISOString();
    const s = buildM5ShadowAuditSummary(auditItems, { auditRunAt });

    const envelope = {
      schemaVersion: 1,
      sourceVersion: M5_SHADOW_AUDIT_SOURCE_VERSION,
      runnerSourceVersion: M5_M4B_SHADOW_AUDIT_RUNNER_SOURCE_VERSION,
      auditRunAt: s.auditRunAt,
      limit,
      totalRowsFetched: rows.length,
      summary: {
        sampleCount: s.itemsWithValidSidecar,
        skippedInvalidSidecar: s.itemsSkippedInvalidSidecar,
        modeReadonlyCount: s.modeReadonlyCount,
        modeShadowCount: s.modeShadowCount,
        m5ProposedNonNullCount: s.m5ProposedNonNullCount,
        wouldChangeCurrentDisplayTrueCount: s.wouldChangeCurrentDisplayTrueCount,
        shadowConsensusDecisionRuleCount: s.shadowConsensusDecisionRuleCount,
        pairwiseSourceAvailableCount: s.pairwiseSourceAvailableCount,
        rrmSimSourceAvailableCount: s.rrmSimSourceAvailableCount,
        decisionRuleCounts: s.decisionRuleCounts,
        shadowReasonCounts: s.shadowReasonCounts,
        guardrailPassViewerSafeNoCautionSignalCount: s.guardrailPassViewerSafeNoCautionSignalCount,
        guardrailPassOtherCount: s.guardrailPassOtherCount,
        guardrailCautionCount: s.guardrailCautionCount,
        guardrailBlockCount: s.guardrailBlockCount,
        guardrailNotEvaluatedCount: s.guardrailNotEvaluatedCount,
        notes: s.notes,
      },
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(envelope, null, pretty ? 2 : undefined));
  } finally {
    await app.close();
  }
}

function isExecutedAsCli(): boolean {
  const p = (process.argv[1] ?? "").replace(/\\/g, "/");
  return p.endsWith("m5-m4b-shadow-audit-runner.js") || p.endsWith("m5-m4b-shadow-audit-runner.ts");
}

if (isExecutedAsCli()) {
  void main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
