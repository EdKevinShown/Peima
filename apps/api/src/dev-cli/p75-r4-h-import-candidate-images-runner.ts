/**
 * DEV-ONLY · P7.5-r4-h — Import `dev-assets/test-user-images` into demo User/UserImage rows.
 *
 * Usage (after nest build):
 *   From repo root:
 *     pnpm --filter @peima/api run p75:r4-import-candidate-images -- --folder=dev-assets/test-user-images --dryRun=true
 *   From apps/api with plain node:
 *     Prefer --folder=<absolute path to .../dev-assets/test-user-images>, or ../../dev-assets/... (cwd-relative).
 */

import "reflect-metadata";
import * as path from "path";
import * as dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import { CandidateImageDevImportService } from "../modules/dev/candidate-image-dev-import.service";
import { parseP75R4HImportCandidateImagesCliArgs } from "./p75-r4-h-import-candidate-images-cli-args";
import { P75R4HCandidateImageImportRunnerModule } from "./p75-r4-h-candidate-image-import.module";

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [
    path.join(here, "../../.env"),
    path.join(here, "../../../.env"),
  ]) {
    dotenv.config({ path: p });
  }
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();
  const cli = parseP75R4HImportCandidateImagesCliArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL missing; set in .env at repo root or apps/api.",
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(
    P75R4HCandidateImageImportRunnerModule,
    { logger: false },
  );
  try {
    const importer = app.get(CandidateImageDevImportService);
    const report = await importer.run({
      folderRelOrAbs: cli.folder,
      limit: cli.limit,
      dryRun: cli.dryRun,
      createMissingUsers: cli.createMissingUsers,
      copyToUploads: cli.copyToUploads,
      tagPrefix: cli.tagPrefix,
      runDetection: cli.runDetection,
      runVision: cli.runVision,
      excludeUserId: cli.excludeUserId,
    });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

void main();
