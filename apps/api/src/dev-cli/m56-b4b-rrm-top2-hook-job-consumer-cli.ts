/**
 * CLI entry for M5.6-B4B pending hook job consumer dry-run runner.
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
  formatM56B4bConsumerOutput,
  parseM56B4bConsumerArgs,
  runM56B4bHookJobConsumerDryRunRunner,
  type M56B4bConsumerRunnerPrisma,
} from "./m56-b4b-rrm-top2-hook-job-consumer-runner";

@Module({
  imports: [PrismaModule],
})
class M56B4bHookJobConsumerCliModule {}

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [path.join(here, "../../.env"), path.join(here, "../../../.env")]) {
    dotenv.config({ path: p });
  }
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();

  const parsed = parseM56B4bConsumerArgs(process.argv.slice(2));
  if (!parsed.ok) {
    // eslint-disable-next-line no-console
    console.error("Refused: --apply is not supported in M5.6-B4B (dry-run only).");
    process.exit(1);
  }

  const opts = parsed.opts;

  if (process.env.NODE_ENV === "production") {
    // eslint-disable-next-line no-console
    console.error("Refused: NODE_ENV is production.");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.error("DATABASE_URL missing; set in .env (repo root or apps/api).");
    process.exit(1);
  }

  let app: INestApplicationContext | null = null;
  try {
    app = await NestFactory.createApplicationContext(M56B4bHookJobConsumerCliModule, { logger: false });
    const prisma = app.get(PrismaService) as unknown as M56B4bConsumerRunnerPrisma;
    const result = await runM56B4bHookJobConsumerDryRunRunner(prisma, opts);
    if ("refused" in result && result.refused) {
      // eslint-disable-next-line no-console
      console.error("Refused: NODE_ENV is production.");
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(formatM56B4bConsumerOutput(result, opts.pretty));
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
