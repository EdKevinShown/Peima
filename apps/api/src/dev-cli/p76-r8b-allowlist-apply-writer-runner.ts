/**
 * P7.6-r8b — allowlist apply sidecar writer dev-cli.
 *
 * From `apps/api` after `pnpm exec nest build`:
 *   pnpm run p76:r8b-allowlist-apply-writer -- \
 *     --viewerUserId=<id> \
 *     --selectedCandidateId=<id> \
 *     --stage1SelectedCandidateIds=id1,id2 \
 *     --stage2Top2CandidateIds=id1,id2 \
 *     --dryRun=true
 */

import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import { readP76AllowlistApplyEnv } from "../modules/matching/p76-allowlist-apply-env";
import {
  assertP76AllowlistApplyResultPrivacySafe,
  writeP76AllowlistApplyMeta,
} from "../modules/matching/p76-allowlist-apply-writer";
import {
  P76R8bCliArgsError,
  parseP76R8bAllowlistApplyWriterCliArgs,
} from "./p76-r8b-allowlist-apply-writer-cli-args";

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
class P76R8bAllowlistApplyWriterRunnerModule {}

export async function runP76R8bAllowlistApplyWriterMain(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  loadDotenvFromCommonLocations();

  let cli;
  try {
    cli = parseP76R8bAllowlistApplyWriterCliArgs(argv);
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

  const env = readP76AllowlistApplyEnv();

  const app = await NestFactory.createApplicationContext(
    P76R8bAllowlistApplyWriterRunnerModule,
    { logger: false },
  );

  try {
    const prisma = app.get(PrismaService);
    const result = await writeP76AllowlistApplyMeta(prisma, cli, env);
    assertP76AllowlistApplyResultPrivacySafe(result);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  try {
    await runP76R8bAllowlistApplyWriterMain();
    process.exit(0);
  } catch (err) {
    if (err instanceof P76R8bCliArgsError) {
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
