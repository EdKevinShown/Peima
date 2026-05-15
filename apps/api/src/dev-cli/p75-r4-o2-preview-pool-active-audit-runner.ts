/**
 * DEV / STAGING CLI — Active onboarding photo preview pool audit (P7.5-r4-o2).
 *
 * From repo root (after nest build):
 *   pnpm --filter @peima/api run p75:r4-o2-preview-pool-active-audit -- --viewerUserId=u1
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import { parseCandidateMappingJson } from "../modules/dev/p75-r4-h-candidate-image-import.plan";
import { OnboardingPhotoPreviewPoolActiveAuditService } from "../modules/onboarding/onboarding-photo-preview-pool-active-audit.service";
import { parseP75R4O2PreviewPoolActiveAuditCliArgs } from "./p75-r4-o2-preview-pool-active-audit-cli-args";
import { P75R4O2PreviewPoolActiveAuditRunnerModule } from "./p75-r4-o2-preview-pool-active-audit-runner.module";

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [
    path.join(here, "../../.env"),
    path.join(here, "../../../.env"),
  ]) {
    dotenv.config({ path: p });
  }
}

function defaultMappingPath(): string {
  return path.resolve(__dirname, "../../../dev-assets/test-user-images/mapping.json");
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();

  const cli = parseP75R4O2PreviewPoolActiveAuditCliArgs(process.argv.slice(2));
  if (!cli.viewerUserId) {
    console.error("Usage: --viewerUserId=<id> [--mappingPath=path/to/mapping.json]");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  const mappingPath = cli.mappingPath ?? defaultMappingPath();
  let mappingItems: Array<{ file: string; gender?: string }> = [];
  try {
    const raw = fs.readFileSync(mappingPath, "utf8");
    const parsed = parseCandidateMappingJson(raw);
    mappingItems = parsed?.items ?? [];
  } catch (e) {
    console.error(
      JSON.stringify({
        mapping_path: mappingPath,
        mapping_error: e instanceof Error ? e.message : "read_failed",
      }),
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(
    P75R4O2PreviewPoolActiveAuditRunnerModule,
    { logger: false },
  );
  try {
    const svc = app.get(OnboardingPhotoPreviewPoolActiveAuditService);
    const report = await svc.auditActivePoolForViewer(cli.viewerUserId, mappingItems);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

void main();
