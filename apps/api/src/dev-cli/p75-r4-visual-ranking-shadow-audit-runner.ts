/**
 * P7.5-r4-c — Read-only onboarding visual ranking shadow audit CLI.
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   node dist/dev-cli/p75-r4-visual-ranking-shadow-audit-runner.js --limit=100
 *   node dist/dev-cli/p75-r4-visual-ranking-shadow-audit-runner.js --since=2026-05-01 --until=2026-05-16
 */

import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@peima/database";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  VISUAL_RANKING_SHADOW_SCHEMA_VERSION,
  VISUAL_RANKING_SHADOW_SOURCE_VERSION,
} from "../modules/onboarding/vision/visual-ranking-shadow.types";
import {
  P75_R4_SHADOW_AUDIT_SCHEMA_VERSION,
  createShadowAuditAccumulator,
  finalizeShadowAuditReport,
  ingestParsedShadow,
  parseVisualRankingShadowPayloadSafe,
} from "../modules/onboarding/vision/visual-ranking-shadow-audit";
import { parseP75R4ShadowAuditCliArgs } from "./p75-r4-visual-ranking-shadow-audit-cli-args";

const SHADOW_AUDIT_CLI_SOURCE_VERSION =
  "p7.5-r4-c-visual-ranking-shadow-audit-cli-v1" as const;

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

@Module({
  imports: [PrismaModule],
})
class P75ShadowAuditRunnerModule {}

function buildWhereClause(
  args: ReturnType<typeof parseP75R4ShadowAuditCliArgs>,
): {
  shadowWhere: Prisma.OnboardingPhotoPreviewPoolShadowWhereInput;
  poolWhere: Prisma.OnboardingPhotoPreviewPoolWhereInput;
} {
  const createdAtCond: Prisma.DateTimeFilter = {};
  if (args.since !== undefined) {
    createdAtCond.gte = args.since;
  }
  if (args.until !== undefined) {
    createdAtCond.lte = args.until;
  }

  const shadowWhere: Prisma.OnboardingPhotoPreviewPoolShadowWhereInput = {
    shadowType: args.shadowType,
    sourceVersion: args.sourceVersion,
  };
  if (Object.keys(createdAtCond).length > 0) {
    shadowWhere.createdAt = createdAtCond;
  }
  if (args.userId) {
    shadowWhere.userId = args.userId;
  }

  const poolWhere: Prisma.OnboardingPhotoPreviewPoolWhereInput = {};
  if (Object.keys(createdAtCond).length > 0) {
    poolWhere.createdAt = createdAtCond;
  }
  if (args.userId) {
    poolWhere.userId = args.userId;
  }

  return { shadowWhere, poolWhere };
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();
  const cli = parseP75R4ShadowAuditCliArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
     
    console.error(
      "DATABASE_URL missing; set in .env (repo root or apps/api).",
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(
    P75ShadowAuditRunnerModule,
    { logger: false },
  );
  try {
    const prisma = app.get(PrismaService);

    const { shadowWhere, poolWhere } = buildWhereClause(cli);

    const [totalMatchingShadowRows, poolsMatchingTotal] = await Promise.all([
      prisma.onboardingPhotoPreviewPoolShadow.count({
        where: shadowWhere,
      }),
      prisma.onboardingPhotoPreviewPool.count({
        where: poolWhere,
      }),
    ]);

    const shadowCoverageRatio =
      poolsMatchingTotal > 0
        ? Math.min(1, totalMatchingShadowRows / poolsMatchingTotal)
        : null;

    const rows = await prisma.onboardingPhotoPreviewPoolShadow.findMany({
      where: shadowWhere,
      orderBy: { createdAt: "desc" },
      take: cli.limit,
      select: { payloadJson: true },
    });

    const acc = createShadowAuditAccumulator();
    let invalidPayload = 0;

    for (const row of rows) {
      const parsed = parseVisualRankingShadowPayloadSafe(row.payloadJson);
      if (!parsed) {
        invalidPayload += 1;
        continue;
      }
      ingestParsedShadow(acc, parsed);
    }

    const audited = finalizeShadowAuditReport({
      totalShadowRows: rows.length,
      validShadowRows: acc.validCount,
      invalidShadowRows: invalidPayload,
      shadowRowsMatchingQueryTotal: totalMatchingShadowRows,
      poolsMatchingFilterTotal: poolsMatchingTotal,
      shadowCoverageRatio,
      accumulator: acc,
    });

    const outRoot = {
      schemaVersion: P75_R4_SHADOW_AUDIT_SCHEMA_VERSION,
      cliSourceVersion: SHADOW_AUDIT_CLI_SOURCE_VERSION,
      shadowPayloadSchemaExpected: VISUAL_RANKING_SHADOW_SCHEMA_VERSION,
      shadowPayloadSourceExpected: VISUAL_RANKING_SHADOW_SOURCE_VERSION,
      generatedAt: new Date().toISOString(),
      input: {
        limit: cli.limit,
        userIdFilterPresent: cli.userId ? true : false,
        sourceVersion: cli.sourceVersion,
        shadowType: cli.shadowType,
        sinceUtc: cli.since?.toISOString() ?? null,
        untilUtc: cli.until?.toISOString() ?? null,
        jsonlSampleLines: cli.jsonl,
      },
      summary: audited.summary,
      topReasonTags: audited.topReasonTags,
      recommendation: audited.recommendation,
    };

    if (cli.jsonl) {
      for (const row of rows) {
        const p = parseVisualRankingShadowPayloadSafe(row.payloadJson);
        if (!p) {
          console.log(
            JSON.stringify({ ok: false, reason: "invalid_payload" }),
          );
        } else {
          console.log(
            JSON.stringify({
              ok: true,
              changedSlots: p.changedSlots,
              viewerVisionAvailable: p.viewerVisionAvailable,
              applyToPoolIgnored: p.applyToPoolIgnored,
            }),
          );
        }
      }
      console.log(JSON.stringify(outRoot));
    } else {
      console.log(JSON.stringify(outRoot, null, 2));
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
   
  console.error(e);
  process.exit(1);
});
