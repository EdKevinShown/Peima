/**
 * P7.6-r6b — Read-only end-to-end funnel shadow audit CLI.
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   pnpm run p76:r6-end-to-end-funnel-shadow-audit -- \
 *     --viewerUserId=<id> \
 *     --stage2Top2CandidateIds=id1,id2 \
 *     --selectedBy20DOnlyCandidateId=<20d-winner> \
 *     --selectedByRrmCandidateId=<rrm-winner> \
 *     --stage1SelectedCandidateIds=id1,id2,... \
 *     --dryRun=true
 */

import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import { runP76R6EndToEndFunnelShadowAudit } from "../modules/matching/p76-end-to-end-funnel-audit";
import { assertP76EndToEndFunnelAuditPrivacySafe } from "../modules/matching/p76-end-to-end-funnel-legacy-adapter";
import {
  P76R6bCliArgsError,
  parseP76R6EndToEndFunnelShadowAuditCliArgsRaw,
} from "./p76-r6-end-to-end-funnel-shadow-audit-cli-args";

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
class P76R6EndToEndFunnelShadowAuditRunnerModule {}

export async function runP76R6EndToEndFunnelShadowAuditMain(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  loadDotenvFromCommonLocations();

  let raw;
  try {
    raw = parseP76R6EndToEndFunnelShadowAuditCliArgsRaw(argv);
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
    P76R6EndToEndFunnelShadowAuditRunnerModule,
    { logger: false },
  );

  try {
    const prisma = app.get(PrismaService);
    const audit = await runP76R6EndToEndFunnelShadowAudit(prisma, raw);
    assertP76EndToEndFunnelAuditPrivacySafe(audit);
    console.log(JSON.stringify(audit, null, 2));
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  try {
    await runP76R6EndToEndFunnelShadowAuditMain();
    process.exit(0);
  } catch (err) {
    if (err instanceof P76R6bCliArgsError) {
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
