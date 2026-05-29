/**
 * CLI entry for M5.6-B3 controlled RRM Top2 hook job create runner (see `m56-b3-rrm-top2-hook-job-runner.ts`).
 */
import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  formatM56B3HookJobOutput,
  parseM56B3HookJobArgs,
  printM56B3HookJobUsage,
  runM56B3HookJobRunner,
} from "./m56-b3-rrm-top2-hook-job-runner";

@Module({
  imports: [PrismaModule],
})
class M56B3HookJobCliModule {}

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [path.join(here, "../../.env"), path.join(here, "../../../.env")]) {
    dotenv.config({ path: p });
  }
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();

  const opts = parseM56B3HookJobArgs(process.argv.slice(2));
  if (!opts) {
    printM56B3HookJobUsage();
    process.exit(1);
  }

  let app: INestApplicationContext | null = null;
  try {
    if (opts.apply) {
      if (!process.env.DATABASE_URL) {
        // eslint-disable-next-line no-console
        console.error("DATABASE_URL missing; set in .env (repo root or apps/api).");
        process.exit(1);
      }
      app = await NestFactory.createApplicationContext(M56B3HookJobCliModule, { logger: false });
      const prisma = app.get(PrismaService);
      const result = await runM56B3HookJobRunner(opts, prisma);
      if ("refused" in result && result.refused) {
        // eslint-disable-next-line no-console
        console.error("Refused: NODE_ENV is production.");
        process.exit(1);
      }
      // eslint-disable-next-line no-console
      console.log(formatM56B3HookJobOutput(result, opts.pretty));
    } else {
      const result = await runM56B3HookJobRunner(opts, null);
      if ("refused" in result && result.refused) {
        // eslint-disable-next-line no-console
        console.error("Refused: NODE_ENV is production.");
        process.exit(1);
      }
      // eslint-disable-next-line no-console
      console.log(formatM56B3HookJobOutput(result, opts.pretty));
      // eslint-disable-next-line no-console
      console.log("[m56-b3] Dry-run only; pass --apply to persist hook job row.");
    }
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
