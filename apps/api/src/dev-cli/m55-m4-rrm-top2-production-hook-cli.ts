/**
 * CLI entry for M5.5-M4 controlled RRM Top2 production hook (see `m55-m4-rrm-top2-production-hook-runner.ts`).
 */
import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  formatM55M4HookOutput,
  parseM55M4ProductionHookArgs,
  printM55M4Usage,
  runM55M4ProductionHook,
} from "./m55-m4-rrm-top2-production-hook-runner";

@Module({
  imports: [PrismaModule],
})
class M55M4ProductionHookCliModule {}

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [path.join(here, "../../.env"), path.join(here, "../../../.env")]) {
    dotenv.config({ path: p });
  }
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();

  const opts = parseM55M4ProductionHookArgs(process.argv.slice(2));
  if (!opts) {
    printM55M4Usage();
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.error("DATABASE_URL missing; set in .env (repo root or apps/api).");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(M55M4ProductionHookCliModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const result = await runM55M4ProductionHook(opts, prisma);
    if ("refused" in result && result.refused) {
      // eslint-disable-next-line no-console
      console.error("Refused: NODE_ENV is production.");
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(formatM55M4HookOutput(result, opts.pretty));
    if (!opts.apply) {
      // eslint-disable-next-line no-console
      console.log("[m55-m4] Dry-run only; pass --apply to persist (requires env gates).");
    }
  } finally {
    await app.close();
  }
}

void main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
