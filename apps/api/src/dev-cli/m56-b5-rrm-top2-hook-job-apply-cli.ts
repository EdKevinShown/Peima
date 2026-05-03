/**
 * CLI entry for M5.6-B5-B controlled RRM Top2 hook job apply runner.
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
  formatM56B5ApplyOutput,
  parseM56B5ApplyArgs,
  runM56B5HookJobApplyRunner,
  type M56B5ApplyRunnerPrisma,
} from "./m56-b5-rrm-top2-hook-job-apply-runner";

@Module({
  imports: [PrismaModule],
})
class M56B5HookJobApplyCliModule {}

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [path.join(here, "../../.env"), path.join(here, "../../../.env")]) {
    dotenv.config({ path: p });
  }
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();

  if (!process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.error("DATABASE_URL missing; set in .env (repo root or apps/api).");
    process.exit(1);
  }

  const opts = parseM56B5ApplyArgs(process.argv.slice(2));

  let app: INestApplicationContext | null = null;
  try {
    app = await NestFactory.createApplicationContext(M56B5HookJobApplyCliModule, { logger: false });
    const prisma = app.get(PrismaService) as unknown as M56B5ApplyRunnerPrisma;
    const result = await runM56B5HookJobApplyRunner(prisma, opts);

    if ("refused" in result && result.refused) {
      // eslint-disable-next-line no-console
      console.log(formatM56B5ApplyOutput(result, opts.pretty));
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(formatM56B5ApplyOutput(result, opts.pretty));
    if (!opts.apply) {
      // eslint-disable-next-line no-console
      console.log("[m56-b5] Dry-run only; pass --apply and --confirmControlledApply=I_UNDERSTAND to mutate hook jobs.");
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
