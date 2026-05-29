/**
 * P7.6-r4b — Read-only 20D Bidirectional Ranking shadow audit CLI.
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   pnpm run p76:r4b-20d-bidirectional-ranking-shadow-audit -- \
 *     --viewerUserId=<id> \
 *     --candidateUserIds=id1,id2 \
 *     --sourcePoolType=onboarding_gated_cohort \
 *     --topN=6 \
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
  assertP76TwentyDAuditReportPrivacySafe,
  runTwentyDBidirectionalRankingAuditFromDb,
} from "../modules/matching/p76-20d-bidirectional-ranking-db-adapter";
import {
  P76R4bCliArgsError,
  parseP76R4bTwentyDBidirectionalRankingAuditCliArgs,
} from "./p76-r4b-20d-bidirectional-ranking-audit-cli-args";

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
class P76R4bTwentyDBidirectionalRankingAuditRunnerModule {}

export async function runP76R4bTwentyDBidirectionalRankingAuditMain(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  loadDotenvFromCommonLocations();

  let cli;
  try {
    cli = parseP76R4bTwentyDBidirectionalRankingAuditCliArgs(argv);
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
    P76R4bTwentyDBidirectionalRankingAuditRunnerModule,
    { logger: false },
  );

  try {
    const prisma = app.get(PrismaService);
    const report = await runTwentyDBidirectionalRankingAuditFromDb(prisma, cli);
    assertP76TwentyDAuditReportPrivacySafe(report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  try {
    await runP76R4bTwentyDBidirectionalRankingAuditMain();
    process.exit(0);
  } catch (err) {
    if (err instanceof P76R4bCliArgsError) {
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
