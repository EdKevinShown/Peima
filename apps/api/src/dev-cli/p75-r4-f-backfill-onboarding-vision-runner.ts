/**
 * DEV-ONLY · P7.5-r4-f / P7.5-r7-c3 — Backfill `detectionScoreJson.vision` on UserImage rows.
 *
 * rules/stub: sync OnboardingVision (no cloud HTTP).
 * cloud/zhipu: r7 gate + optional mocked/live HTTP via runCloudVisionFacadeAsync.
 *
 * Does not change detectionStatus, reviewStatus, hasPassingPhoto, or admin audit.
 *
 * Usage (after nest build):
 *   cd apps/api
 *   npx dotenv-cli -e ../../.env -- node dist/dev-cli/p75-r4-f-backfill-onboarding-vision-runner.js --limit=50 --provider=cloud --dryRun=true
 *   npx dotenv-cli -e ../../.env -- node dist/dev-cli/p75-r4-f-backfill-onboarding-vision-runner.js --limit=50 --provider=cloud --dryRun=false
 */

import "reflect-metadata";
import * as path from "path";
import { join } from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@peima/database";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  isCloudVisionBackfillProvider,
  parseP75R4FVisionBackfillCliArgs,
} from "./p75-r4-f-vision-backfill-cli-args";
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
import {
  assertCloudVisionBackfillReportPrivacySafe,
  buildCloudVisionBackfillAuditReport,
  buildMergedDetectionScoreJsonForCloudBackfill,
  classifyCloudBackfillRow,
  createEmptyCloudVisionBackfillAudit,
  recordCloudVisionBackfillSkip,
  recordCloudVisionBackfillHttp,
  recordCloudVisionBackfillVisionAudit,
  visionEnvForCloudBackfill,
} from "../modules/onboarding/vision/p75-r7-c3-cloud-vision-backfill";

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [
    path.join(here, "../../.env"),
    path.join(here, "../../../.env"),
  ]) {
    dotenv.config({ path: p });
  }
}

function uploadDirFromEnv(): string {
  return (
    process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads", "user-images")
  );
}

@Module({
  imports: [PrismaModule],
})
class P75R4FVisionBackfillRunnerModule {}

async function runRulesStubBackfill(
  prisma: PrismaService,
  cli: ReturnType<typeof parseP75R4FVisionBackfillCliArgs>,
): Promise<void> {
  const visionEnv = visionEnvForBackfill(cli.provider as "rules" | "stub");
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
  const runOptions = {
    onlyMissingVision: cli.onlyMissingVision,
    includeBlocked: cli.includeBlocked,
  };

  for (const row of rows) {
    if (processedEligible >= cli.limit) {
      break;
    }

    summary.scanned += 1;

    const classified = classifyUserImageForVisionBackfill(row, runOptions);

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
    {
      limit: cli.limit,
      userId: cli.userId,
      provider: cli.provider as "rules" | "stub",
      dryRun: cli.dryRun,
      onlyMissingVision: cli.onlyMissingVision,
      includeBlocked: cli.includeBlocked,
    },
    summary,
    finalizeVisionBackfillSampleTags(tagCounts),
  );
  const out = JSON.stringify(report, null, 2);
  assertVisionBackfillReportPrivacySafe(out);
  console.log(out);
}

async function runCloudBackfill(
  prisma: PrismaService,
  cli: ReturnType<typeof parseP75R4FVisionBackfillCliArgs>,
): Promise<void> {
  const provider = cli.provider as "cloud" | "zhipu";
  const visionEnv = visionEnvForCloudBackfill(provider);
  const uploadDir = uploadDirFromEnv();
  const filters = {
    userId: cli.userId,
    imageIds: cli.imageIds,
    userIds: cli.userIds,
  };
  const runInput = {
    limit: cli.limit,
    dryRun: cli.dryRun,
    provider,
    onlyMissingVision: cli.onlyMissingVision,
    includeBlocked: cli.includeBlocked,
    filters,
  };
  const audit = createEmptyCloudVisionBackfillAudit({
    dryRun: cli.dryRun,
    provider,
  });

  const where: Prisma.UserImageWhereInput = {
    detectionScoreJson: { not: Prisma.DbNull },
  };
  if (cli.userId) {
    where.userId = cli.userId;
  }
  if (cli.userIds.length > 0) {
    where.userId = { in: cli.userIds };
  }
  if (cli.imageIds.length > 0) {
    where.id = { in: cli.imageIds };
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
      imageUrl: true,
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
  const runOptions = {
    onlyMissingVision: cli.onlyMissingVision,
    includeBlocked: cli.includeBlocked,
  };

  for (const row of rows) {
    if (processedEligible >= cli.limit) {
      break;
    }

    audit.scannedImages += 1;

    const classified = classifyCloudBackfillRow(row, runOptions, filters);
    if (classified.action === "skip") {
      recordCloudVisionBackfillSkip(audit, classified.reason);
      continue;
    }

    audit.eligibleImages += 1;
    processedEligible += 1;

    const built = await buildMergedDetectionScoreJsonForCloudBackfill(
      row,
      visionEnv,
      uploadDir,
    );

    if (!built.ok) {
      recordCloudVisionBackfillSkip(audit, built.reason);
      if (built.httpOutcome) {
        recordCloudVisionBackfillHttp(audit, built.httpOutcome);
      }
      continue;
    }

    recordCloudVisionBackfillVisionAudit(
      audit,
      built.vision,
      built.httpOutcome,
    );

    if (!cli.dryRun) {
      await prisma.userImage.update({
        where: { id: row.id },
        data: {
          detectionScoreJson: built.merged as Prisma.InputJsonValue,
        },
      });
      audit.updatedImages += 1;
    }
  }

  const report = buildCloudVisionBackfillAuditReport(runInput, audit);
  const out = JSON.stringify(report, null, 2);
  assertCloudVisionBackfillReportPrivacySafe(out);
  console.log(out);
}

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
    if (isCloudVisionBackfillProvider(cli.provider)) {
      await runCloudBackfill(prisma, cli);
    } else {
      await runRulesStubBackfill(prisma, cli);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
