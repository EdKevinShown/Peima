/**
 * P7.6-r3b — Read-only PhotoVisual First Pool shadow audit CLI.
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   pnpm run p76:r3b-photovisual-pool-shadow-audit -- \
 *     --viewerUserId=<id> \
 *     --sourcePoolType=onboarding_gated_cohort \
 *     --limit=20 \
 *     --selectionLimit=6 \
 *     --dryRun=true
 */

import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  assertP76AuditReportPrivacySafe,
  runPhotoVisualPoolShadowAuditFromDb,
} from "../modules/onboarding/vision/p76-photovisual-first-pool-db-adapter";
import {
  P76R3bCliArgsError,
  parseP76R3bPhotovisualPoolShadowAuditCliArgs,
} from "./p76-r3b-photovisual-pool-shadow-audit-cli-args";

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
class P76R3bPhotovisualPoolShadowAuditRunnerModule {}

export async function runP76R3bPhotovisualPoolShadowAuditMain(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  loadDotenvFromCommonLocations();

  let cli;
  try {
    cli = parseP76R3bPhotovisualPoolShadowAuditCliArgs(argv);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL missing; set in .env (repo root or apps/api).",
    );
    process.exit(1);
    return;
  }

  const app = await NestFactory.createApplicationContext(
    P76R3bPhotovisualPoolShadowAuditRunnerModule,
    { logger: false },
  );

  try {
    const prisma = app.get(PrismaService);
    const report = await runPhotoVisualPoolShadowAuditFromDb(prisma, cli);
    assertP76AuditReportPrivacySafe(report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  try {
    await runP76R3bPhotovisualPoolShadowAuditMain();
    process.exit(0);
  } catch (err) {
    if (err instanceof P76R3bCliArgsError) {
      console.error(err.message);
      process.exit(1);
      return;
    }
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
