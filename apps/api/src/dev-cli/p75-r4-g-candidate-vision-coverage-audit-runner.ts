/**
 * DEV-ONLY · P7.5-r4-g — Read-only audit: onboarding pool viewer/candidate vision coverage gaps.
 *
 * Usage (after nest build):
 *   cd apps/api
 *   npx dotenv-cli -e ../../.env -- node dist/dev-cli/p75-r4-g-candidate-vision-coverage-audit-runner.js --limit=100
 */

import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Prisma } from "@peima/database";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import { parseR4GVisionCoverageCliArgs } from "./p75-r4-g-candidate-vision-coverage-cli-args";
import {
  P75_R4_G_VISUAL_COVERAGE_SCHEMA_VERSION,
  accumulateVisionCoverageFromPools,
  assertR4GVisionCoverageReportPrivacySafe,
  suggestVisionCoverageNextAction,
} from "../modules/onboarding/vision/p75-r4-g-candidate-vision-coverage-audit";

const ONBOARDING_POOL_ACTIVE = "active";

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [
    path.join(here, "../../.env"),
    path.join(here, "../../../.env"),
  ]) {
    dotenv.config({ path: p });
  }
}

const imageSelect = {
  id: true,
  userId: true,
  createdAt: true,
  detectionStatus: true,
  reviewStatus: true,
  detectionScoreJson: true,
} as const;

@Module({
  imports: [PrismaModule],
})
class R4GCoverageAuditRunnerModule {}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();
  const cli = parseR4GVisionCoverageCliArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL missing; set in .env (repo root or apps/api).",
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(
    R4GCoverageAuditRunnerModule,
    { logger: false },
  );

  try {
    const prisma = app.get(PrismaService);

    const poolWhere: Prisma.OnboardingPhotoPreviewPoolWhereInput = {};
    if (cli.poolId) {
      poolWhere.id = cli.poolId;
    }
    if (cli.userId) {
      poolWhere.userId = cli.userId;
    }
    if (!cli.includeArchived) {
      poolWhere.status = ONBOARDING_POOL_ACTIVE;
    }
    if (cli.since ?? cli.until) {
      poolWhere.createdAt = {};
      if (cli.since) poolWhere.createdAt.gte = cli.since;
      if (cli.until) poolWhere.createdAt.lte = cli.until;
    }

    const pools = await prisma.onboardingPhotoPreviewPool.findMany({
      where: poolWhere,
      orderBy: { createdAt: "desc" },
      take: cli.limitPools,
      select: {
        id: true,
        userId: true,
        status: true,
        createdAt: true,
        items: {
          select: { candidateUserId: true },
        },
      },
    });

    const viewerIds = [...new Set(pools.map((p) => p.userId))];
    const candidateIds = [
      ...new Set(pools.flatMap((p) => p.items.map((i) => i.candidateUserId))),
    ];

    const allUserIdsForImages = [...new Set([...viewerIds, ...candidateIds])];

    const imagesRaw =
      allUserIdsForImages.length === 0
        ? []
        : await prisma.userImage.findMany({
            where: { userId: { in: allUserIdsForImages } },
            orderBy: { createdAt: "asc" },
            select: imageSelect,
          });

    type ImgRow = (typeof imagesRaw)[number];

    function groupByUserId(rows: ImgRow[]): Map<string, ImgRow[]> {
      const m = new Map<string, ImgRow[]>();
      for (const r of rows) {
        const list = m.get(r.userId) ?? [];
        list.push(r);
        m.set(r.userId, list);
      }
      return m;
    }

    const byUser = groupByUserId(imagesRaw);

    const viewerImagesByUserId = new Map(
      viewerIds.map((id) => [id, byUser.get(id) ?? []] as const),
    );
    const candidateImagesByUserId = new Map(
      candidateIds.map((id) => [id, byUser.get(id) ?? []] as const),
    );

    const pooled = accumulateVisionCoverageFromPools({
      pools: pools.map((p) => ({
        userId: p.userId,
        items: p.items.map((i) => ({ candidateUserId: i.candidateUserId })),
      })),
      viewerImagesByUserId,
      candidateImagesByUserId,
    });

    const viewerSummary = {
      uniqueViewers: pooled.uniqueViewerUsers,
      viewersWithUserImage: pooled.perViewerFlags.filter((f) => f.hasUserImage)
        .length,
      viewersWithPassingPhoto: pooled.viewersWithPassingPhoto,
      viewersWithDetectionScoreJsonAny: pooled.perViewerFlags.filter(
        (f) => f.hasDetectionScoreJsonAny,
      ).length,
      viewersWithVisionKeyAny: pooled.perViewerFlags.filter(
        (f) => f.hasVisionKeyAny,
      ).length,
      viewersUsableVisionOkViaPassing: pooled.viewersWithUsableVision,
      viewersVisionGateBlockedReviewAny: pooled.viewersWithVisionBlockingGate,
    };

    const recommendation = suggestVisionCoverageNextAction(
      pooled.breakdown,
      pooled.uniqueCandidateUsers,
    );

    const candidateDebugIdsSample =
      cli.debugIds && candidateIds.length > 0
        ? candidateIds.slice(0, 20)
        : undefined;

    const report = {
      schemaVersion: P75_R4_G_VISUAL_COVERAGE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      input: {
        limitPools: cli.limitPools,
        userIdFilterPresent: Boolean(cli.userId),
        poolIdFilterPresent: Boolean(cli.poolId),
        includeArchived: cli.includeArchived,
        sinceUtc: cli.since?.toISOString() ?? null,
        untilUtc: cli.until?.toISOString() ?? null,
        debugIds: cli.debugIds,
      },
      summary: {
        poolsScanned: pooled.poolsScanned,
        poolItemsScanned: pooled.poolItemsScanned,
        uniqueCandidateUsers: pooled.uniqueCandidateUsers,
        viewerVisionAvailableRate: pooled.summary.viewerVisionAvailableRate,
        candidateUsableVisionRate: pooled.summary.candidateUsableVisionRate,
        candidateDetectionCoverageRate:
          pooled.summary.candidateDetectionCoverageRate,
        candidateImageCoverageRate:
          pooled.summary.candidateImageCoverageRate,
      },
      viewerAggregate: viewerSummary,
      breakdown: {
        candidatesMissingUserImage:
          pooled.breakdown.candidatesMissingUserImage,
        candidatesMissingDetectionScoreJson:
          pooled.breakdown.candidatesMissingDetectionScoreJson,
        candidatesMissingVision:
          pooled.breakdown.candidatesMissingVision,
        candidatesVisionSkipped:
          pooled.breakdown.candidatesVisionSkipped,
        candidatesBlockedReview:
          pooled.breakdown.candidatesBlockedReview,
        candidatesUsableVisionOk:
          pooled.breakdown.candidatesUsableVisionOk,
      },
      recommendation,
      ...(candidateDebugIdsSample
        ? { debugCandidateUserIdsSample: candidateDebugIdsSample }
        : {}),
    };

    const out = JSON.stringify(report, null, 2);
    assertR4GVisionCoverageReportPrivacySafe(out);
    console.log(out);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
