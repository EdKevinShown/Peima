/**
 * CLI entry for M5.5-M2 RRM Top2 meta writer (see `m55-m2-rrm-top2-meta-writer-runner.ts`).
 */
import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaModule } from "../common/prisma/prisma.module";
import { PrismaService } from "../common/prisma/prisma.service";
import { isM55FixtureBlockedInProduction } from "./m55-m0-rrm-summary-fixture.lib";
import {
  parseM55M2WriterArgs,
  printM55M2Usage,
  runM55M2RrmTop2MetaWriter,
} from "./m55-m2-rrm-top2-meta-writer-runner";

@Module({
  imports: [PrismaModule],
})
class M55M2WriterCliModule {}

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [path.join(here, "../../.env"), path.join(here, "../../../.env")]) {
    dotenv.config({ path: p });
  }
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();

  if (isM55FixtureBlockedInProduction()) {
    // eslint-disable-next-line no-console
    console.error("Refused: NODE_ENV is production.");
    process.exit(1);
  }

  const opts = parseM55M2WriterArgs(process.argv.slice(2));
  if (!opts) {
    printM55M2Usage();
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.error("DATABASE_URL missing; set in .env (repo root or apps/api).");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(M55M2WriterCliModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const result = await runM55M2RrmTop2MetaWriter(opts, prisma);
    if (result && typeof result === "object" && "error" in result) {
      // eslint-disable-next-line no-console
      console.error((result as { error: string }).error);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
    if (!opts.apply) {
      // eslint-disable-next-line no-console
      console.log("[m55-m2] Dry-run only; pass --apply to write summary (with --mergeSummary) and meta.");
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
