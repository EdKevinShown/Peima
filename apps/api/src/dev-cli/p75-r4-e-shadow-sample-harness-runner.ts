/**
 * DEV-ONLY · P7.5-r4-e — Repeated onboarding preview pool generates to accumulate shadow rows.
 *
 * Prerequisites:
 * - Local API DB with ≥6 gated candidates globally (same as real generate())
 * - At least one viewer with aesthetic completed + ≥1 image + UserPreference + UserProfile (relationProfile)
 * - Recommended env (document only; inject via .env / shell):
 *   PEIMA_ONBOARDING_VISION_ENABLED=1
 *   PEIMA_ONBOARDING_VISION_PROVIDER=rules  OR stub
 *   PEIMA_ONBOARDING_VISION_SHADOW_ENABLED=1
 *   PEIMA_ONBOARDING_VISION_APPLY_TO_POOL=0
 *
 * Usage (after nest build):
 *   cd apps/api
 *   npx dotenv-cli -e ../../.env -- node dist/dev-cli/p75-r4-e-shadow-sample-harness-runner.js
 *   npx dotenv-cli -e ../../.env -- node dist/dev-cli/p75-r4-e-shadow-sample-harness-runner.js --repeat=25 --sleepMs=400 --viewer=<cuid>
 *
 * Stderr progress lines intentionally omit poolId / userIds (dev privacy hygiene).
 * JSON summary on stdout contains no raw identifiers.
 */

import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaService } from "../common/prisma/prisma.service";
import { OnboardingModule } from "../modules/onboarding/onboarding.module";
import { OnboardingPhotoPreviewPoolService } from "../modules/onboarding/onboarding-photo-preview-pool.service";

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [
    path.join(here, "../../.env"),
    path.join(here, "../../../.env"),
  ]) {
    dotenv.config({ path: p });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv: string[]): {
  repeat: number;
  sleepMs: number;
  viewerId?: string;
} {
  let repeat = 20;
  let sleepMs = 350;
  let viewerId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--repeat=")) {
      repeat = Number.parseInt(a.slice("--repeat=".length), 10);
    } else if (a === "--repeat") {
      const v = argv[i + 1];
      if (v && !v.startsWith("--")) {
        repeat = Number.parseInt(v, 10);
        i += 1;
      }
    } else if (a.startsWith("--sleepMs=")) {
      sleepMs = Number.parseInt(a.slice("--sleepMs=".length), 10);
    } else if (a === "--sleepMs") {
      const v = argv[i + 1];
      if (v && !v.startsWith("--")) {
        sleepMs = Number.parseInt(v, 10);
        i += 1;
      }
    } else if (a.startsWith("--viewer=")) {
      viewerId = a.slice("--viewer=".length).trim() || undefined;
    } else if (a === "--viewer") {
      const v = argv[i + 1];
      if (v && !v.startsWith("--")) {
        viewerId = v.trim();
        i += 1;
      }
    }
  }

  if (!Number.isFinite(repeat) || repeat < 1) repeat = 20;
  if (repeat > 500) repeat = 500;
  if (!Number.isFinite(sleepMs) || sleepMs < 50) sleepMs = 350;
  if (sleepMs > 10_000) sleepMs = 10_000;

  return { repeat, sleepMs, viewerId };
}

@Module({
  imports: [OnboardingModule],
})
class HarnessRootModule {}

async function resolveViewer(
  prisma: PrismaService,
  explicitViewerId?: string,
): Promise<string | null> {
  if (explicitViewerId) {
    const u = await prisma.user.findUnique({
      where: { id: explicitViewerId },
      select: { id: true },
    });
    return u?.id ?? null;
  }

  const u = await prisma.user.findFirst({
    where: {
      onboardingPhotoAestheticCompletedAt: { not: null },
      images: { some: {} },
      preference: { isNot: null },
      relationProfile: { isNot: null },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return u?.id ?? null;
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();
  const { repeat, sleepMs, viewerId: viewerArg } = parseArgs(process.argv.slice(2));

  console.error("[p75-r4-e] DEV-ONLY shadow sample harness — rotate pools for one qualifying viewer.");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing.");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(HarnessRootModule, {
    logger: false,
  });
  try {
    const prisma = app.get(PrismaService);
    const poolSvc = app.get(OnboardingPhotoPreviewPoolService);

    const viewerId = await resolveViewer(prisma, viewerArg);
    if (!viewerId) {
      console.error(
        "[p75-r4-e] No qualifying viewer (--viewer=<id> or findFirst with aesthetic+image+pref+relationProfile).",
      );
      process.exit(2);
    }

    let ok = 0;
    let fail = 0;
    const failures: Array<{ iteration: number; message: string }> = [];

    for (let i = 1; i <= repeat; i++) {
      try {
        const bundle = await poolSvc.generate(viewerId);
        ok += 1;
        console.error(`[p75-r4-e] iter ${i}/${repeat} OK items=${bundle.items.length}`);
      } catch (e: unknown) {
        fail += 1;
        const message = e instanceof Error ? e.message : String(e);
        failures.push({ iteration: i, message });
        console.error(`[p75-r4-e] iter ${i}/${repeat} FAIL: ${message}`);
      }
      await sleep(sleepMs);
    }

    const shadowCount = await prisma.onboardingPhotoPreviewPoolShadow.count({
      where: { userId: viewerId },
    });

    console.log(
      JSON.stringify(
        {
          schemaVersion: "p7.5-r4-e-shadow-sample-harness-v1",
          viewerIdMasked: "***",
          repeatRequested: repeat,
          sleepMs,
          generateSucceeded: ok,
          generateFailed: fail,
          shadowRowsForViewerApproxHint: shadowCount,
          failures: failures.slice(0, 5),
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
