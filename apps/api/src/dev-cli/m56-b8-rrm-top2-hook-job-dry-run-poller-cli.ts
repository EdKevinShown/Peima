/**
 * CLI entry for M5.6-B8-B RRM Top2 hook job independent dry-run poller.
 */
import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import type { RrmTop2HookJobApplyPrisma } from "../modules/matching/rrm-top2-hook-job-apply.service";
import {
  formatM56B8PollerOutput,
  parseM56B8PollerArgs,
  runM56B8HookJobDryRunPoller,
} from "./m56-b8-rrm-top2-hook-job-dry-run-poller";

@Module({
  imports: [PrismaModule],
})
class M56B8HookJobDryRunPollerCliModule {}

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [path.join(here, "../../.env"), path.join(here, "../../../.env")]) {
    dotenv.config({ path: p });
  }
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();

  const argv = process.argv.slice(2);
  const parsed = parseM56B8PollerArgs(argv);
  if (!parsed.ok) {
    // eslint-disable-next-line no-console
    console.log(formatM56B8PollerOutput(parsed, argv.includes("--pretty")));
    process.exit(1);
  }

  const opts = parsed.opts;

  if (!process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.error("DATABASE_URL missing; set in .env (repo root or apps/api).");
    process.exit(1);
  }

  let app: INestApplicationContext | null = null;
  try {
    app = await NestFactory.createApplicationContext(M56B8HookJobDryRunPollerCliModule, { logger: false });
    const prisma = app.get(PrismaService) as unknown as RrmTop2HookJobApplyPrisma;
    const result = await runM56B8HookJobDryRunPoller(prisma, opts);

    if ("refused" in result && result.refused) {
      // eslint-disable-next-line no-console
      console.log(formatM56B8PollerOutput(result, opts.pretty));
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(formatM56B8PollerOutput(result, opts.pretty));
  } finally {
    if (app) {
      await app.close();
    }
  }
}

void main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
