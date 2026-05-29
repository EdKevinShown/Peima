/**
 * P7.6-r8c — dev dry-run audit runner.
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   pnpm run p76:r8c-allowlist-apply-dev-dry-run-audit
 */

import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  resolveRepoRootFromDistDevCli,
  runP76R8cDevDryRunAudit,
} from "./p76-r8c-allowlist-apply-dev-dry-run-audit";

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
class P76R8cAuditRunnerModule {}

export async function runP76R8cAllowlistApplyDevDryRunAuditMain(): Promise<void> {
  loadDotenvFromCommonLocations();
  const repoRoot = resolveRepoRootFromDistDevCli();

  let report;
  let migrationAttemptError: string | null = null;

  if (process.env.DATABASE_URL) {
    const app = await NestFactory.createApplicationContext(
      P76R8cAuditRunnerModule,
      { logger: false },
    );
    try {
      const prisma = app.get(PrismaService);
      report = await runP76R8cDevDryRunAudit({
        repoRoot,
        queryPrisma: prisma,
        migrationApplied: undefined,
      });
    } catch (err) {
      migrationAttemptError =
        err instanceof Error ? err.message : String(err);
      report = await runP76R8cDevDryRunAudit({ repoRoot });
    } finally {
      await app.close();
    }
  } else {
    report = await runP76R8cDevDryRunAudit({ repoRoot });
    migrationAttemptError = "DATABASE_URL missing";
  }

  const outDir = path.join(repoRoot, "artifacts/p76/r8c");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "dev-dry-run-audit-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  const summary = {
    outPath,
    migrationAttemptError,
    dbReachable: report.dbReachable,
    migrationApplied: report.migrationApplied,
    violationCount: report.violation.violationCount,
  };
  console.log(JSON.stringify({ report, summary }, null, 2));
}

async function main(): Promise<void> {
  try {
    await runP76R8cAllowlistApplyDevDryRunAuditMain();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
