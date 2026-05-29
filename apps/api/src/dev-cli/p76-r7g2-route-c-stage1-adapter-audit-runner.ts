/**
 * P7.6-r7g2 / r7g3 — Route C Stage1 clean pool adapter audit CLI (read-only).
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   pnpm run p76:r7g2-route-c-stage1-adapter-audit -- \
 *     --viewerUserId=<id> \
 *     --sourcePoolType=route_c_clean_pool \
 *     --poolSourceVersion=p7.6-r7j3-staging-cohort-v1 \
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
  assertRouteCStage1AdapterPrivacySafe,
  runRouteCStage1AdapterAuditFromDb,
} from "../modules/onboarding/vision/p76-route-c-stage1-adapter";
import {
  P76R7g2CliArgsError,
  parseP76R7g2RouteCStage1AdapterAuditCliArgs,
} from "./p76-r7g2-route-c-stage1-adapter-audit-cli-args";

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
class P76R7g2RouteCStage1AdapterAuditRunnerModule {}

export async function runP76R7g2RouteCStage1AdapterAuditMain(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  loadDotenvFromCommonLocations();

  let cli;
  try {
    cli = parseP76R7g2RouteCStage1AdapterAuditCliArgs(argv);
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
    P76R7g2RouteCStage1AdapterAuditRunnerModule,
    { logger: false },
  );

  try {
    const prisma = app.get(PrismaService);
    const report = await runRouteCStage1AdapterAuditFromDb(prisma, cli);
    assertRouteCStage1AdapterPrivacySafe(report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  try {
    await runP76R7g2RouteCStage1AdapterAuditMain();
    process.exit(0);
  } catch (err) {
    if (err instanceof P76R7g2CliArgsError) {
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
