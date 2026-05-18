/**
 * P7.6-r5b — Read-only RRM Top2 Final Selector shadow audit CLI.
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   pnpm run p76:r5b-rrm-top2-final-selector-shadow-audit -- \
 *     --viewerUserId=<id> \
 *     --top2CandidateIds=id1,id2 \
 *     --selectedBy20DOnlyCandidateId=<20d-winner> \
 *     --sourcePoolType=onboarding_gated_cohort \
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
  assertP76RrmTop2AuditReportPrivacySafe,
  runRrmTop2FinalSelectorAuditFromDb,
} from "../modules/matching/p76-rrm-top2-final-selector-db-adapter";
import {
  P76R5bCliArgsError,
  parseP76R5bRrmTop2FinalSelectorAuditCliArgs,
} from "./p76-r5b-rrm-top2-final-selector-audit-cli-args";

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
class P76R5bRrmTop2FinalSelectorAuditRunnerModule {}

export async function runP76R5bRrmTop2FinalSelectorAuditMain(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  loadDotenvFromCommonLocations();

  let cli;
  try {
    cli = parseP76R5bRrmTop2FinalSelectorAuditCliArgs(argv);
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
    P76R5bRrmTop2FinalSelectorAuditRunnerModule,
    { logger: false },
  );

  try {
    const prisma = app.get(PrismaService);
    const report = await runRrmTop2FinalSelectorAuditFromDb(prisma, cli);
    assertP76RrmTop2AuditReportPrivacySafe(report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  try {
    await runP76R5bRrmTop2FinalSelectorAuditMain();
    process.exit(0);
  } catch (err) {
    if (err instanceof P76R5bCliArgsError) {
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
