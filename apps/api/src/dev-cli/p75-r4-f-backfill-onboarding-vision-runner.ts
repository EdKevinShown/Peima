/**
 * DEV-ONLY · P7.5-r4-f — Backfill `detectionScoreJson.vision` on existing UserImage rows.
 *
 * Uses OnboardingVision rules/stub provider only (no cloud API). Does not change
 * detectionStatus, reviewStatus, hasPassingPhoto, or admin audit.
 *
 * Usage (after nest build):
 *   cd apps/api
 *   npx dotenv-cli -e ../../.env -- node dist/dev-cli/p75-r4-f-backfill-onboarding-vision-runner.js --limit=200 --dryRun=true
 *   npx dotenv-cli -e ../../.env -- node dist/dev-cli/p75-r4-f-backfill-onboarding-vision-runner.js --limit=200 --dryRun=false
 *
 * Recommended env (unchanged by this CLI except in-memory provider override):
 *   PEIMA_ONBOARDING_VISION_APPLY_TO_POOL=0
 */

import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@peima/database";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import { parseP75R4FVisionBackfillCliArgs } from "./p75-r4-f-vision-backfill-cli-args";
import {
  finalizeVisionBackfillSampleTags,
  recordVisionBackfillSampleTags,
  assertVisionBackfillReportPrivacySafe,
  buildMergedDetectionScoreJsonForBackfill,
  buildVisionBackfillReport,
  classifyUserImageForVisionBackfill,
  compareVisionBackfillDetectionPriority,
  createEmptyVisionBackfillSummary,
  recordVisionBackfillSkip,
  visionEnvForBackfill,
  VISION_BACKFILL_BLOCKED_REVIEW_STATUSES,
} from "../modules/onboarding/vision/p75-r4-f-vision-backfill";

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [
    path.join(here, "../../.env"),
    path.join(here, "../../../.env"),
  ]) {
    dotenv.config({ path: p });
  }
}

@Module({
  imports: [PrismaModule],
})
class P75R4FVisionBackfillRunnerModule {}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();
  const cli = parseP75R4FVisionBackfillCliArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL missing; set in .env (repo root or apps/api).",
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(
    P75R4FVisionBackfillRunnerModule,
    { logger: false },
  );

  try {
    const prisma = app.get(PrismaService);
    const visionEnv = visionEnvForBackfill(cli.provider);
    const summary = createEmptyVisionBackfillSummary();
    const tagCounts = new Map<string, number>();

    const where: Prisma.UserImageWhereInput = {
      detectionScoreJson: { not: Prisma.DbNull },
    };
    if (cli.userId) {
      where.userId = cli.userId;
    }
    if (!cli.includeBlocked) {
      where.reviewStatus = {
        notIn: [...VISION_BACKFILL_BLOCKED_REVIEW_STATUSES],
      };
    }

    const fetchBatch = Math.min(cli.limit * 5, 50_000);
    const rows = await prisma.userImage.findMany({
      where,
      select: {
        id: true,
        userId: true,
        detectionStatus: true,
        reviewStatus: true,
        detectionScoreJson: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: fetchBatch,
    });

    rows.sort((a, b) =>
      compareVisionBackfillDetectionPriority(
        { detectionStatus: a.detectionStatus, createdAt: a.createdAt },
        { detectionStatus: b.detectionStatus, createdAt: b.createdAt },
      ),
    );

    let processedEligible = 0;

    for (const row of rows) {
      if (processedEligible >= cli.limit) {
        break;
      }

      summary.scanned += 1;

      const classified = classifyUserImageForVisionBackfill(row, {
        onlyMissingVision: cli.onlyMissingVision,
        includeBlocked: cli.includeBlocked,
      });

      if (classified.action === "skip") {
        recordVisionBackfillSkip(summary, classified.reason);
        continue;
      }

      summary.eligible += 1;
      processedEligible += 1;

      try {
        const built = buildMergedDetectionScoreJsonForBackfill(
          row.detectionScoreJson,
          visionEnv,
        );
        if (!built) {
          summary.failed += 1;
          continue;
        }

        summary.wouldUpdate += 1;
        recordVisionBackfillSampleTags(tagCounts, built.vision);

        if (!cli.dryRun) {
          await prisma.userImage.update({
            where: { id: row.id },
            data: {
              detectionScoreJson: built.merged as Prisma.InputJsonValue,
            },
          });
          summary.updated += 1;
        }
      } catch {
        summary.failed += 1;
      }
    }

    const report = buildVisionBackfillReport(
      cli,
      summary,
      finalizeVisionBackfillSampleTags(tagCounts),
    );
    const out = JSON.stringify(report, null, 2);
    assertVisionBackfillReportPrivacySafe(out);
    console.log(out);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});