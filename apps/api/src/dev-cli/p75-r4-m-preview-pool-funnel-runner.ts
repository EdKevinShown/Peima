/**
 * DEV / STAGING CLI — Onboarding photo preview pool candidate funnel audit (P7.5-r4-m).
 *
 * Production: set ALLOW_PREVIEW_POOL_FUNNEL_AUDIT=1.
 *
 * From repo root (after nest build):
 *   pnpm --filter @peima/api run p75:r4-m-preview-pool-funnel -- --viewerUserId=u1
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import { OnboardingPhotoPreviewPoolFunnelAuditService } from "../modules/onboarding/onboarding-photo-preview-pool-funnel.audit.service";
import {
  getMappingItems,
  summarizeDemoMappingGender,
} from "../modules/onboarding/onboarding-photo-preview-pool-funnel.audit";
import { P75R4MPreviewPoolFunnelRunnerModule } from "./p75-r4-m-preview-pool-funnel-runner.module";

function loadDotenvFromCommonLocations(): void {
  const here = __dirname;
  for (const p of [
    path.join(here, "../../.env"),
    path.join(here, "../../../.env"),
  ]) {
    dotenv.config({ path: p });
  }
}

function parseViewerId(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a.startsWith("--viewerUserId=")) {
      const v = a.slice("--viewerUserId=".length).trim();
      return v || null;
    }
    if (a === "--viewerUserId" || a === "-v") {
      const v = argv[i + 1]?.trim();
      if (v) return v;
    }
  }
  return null;
}

function defaultMappingPath(): string {
  return path.resolve(__dirname, "../../../dev-assets/test-user-images/mapping.json");
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();

  const viewerUserId = parseViewerId(process.argv.slice(2));
  if (!viewerUserId) {
    console.error("Usage: --viewerUserId=<id>");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  const mappingPath =
    process.env.P75_R4_TEST_USER_IMAGES_MAPPING ||
    defaultMappingPath();

  let mappingSummary: Record<string, unknown> = {
    mapping_path: mappingPath,
    error: null as string | null,
    gender_summary: null as unknown,
  };
  try {
    const raw = JSON.parse(fs.readFileSync(mappingPath, "utf8")) as unknown;
    const mappingItems = getMappingItems(raw);
    mappingSummary.gender_summary = summarizeDemoMappingGender(mappingItems);
  } catch (e) {
    mappingSummary.error =
      e instanceof Error ? e.message : "failed reading mapping.json";
  }

  const app = await NestFactory.createApplicationContext(
    P75R4MPreviewPoolFunnelRunnerModule,
    { logger: false },
  );
  try {
    const audit = app.get(OnboardingPhotoPreviewPoolFunnelAuditService);
    const report = await audit.auditForViewer(viewerUserId);
    console.log(
      JSON.stringify(
        {
          mapping_json_summary: mappingSummary,
          funnel: report,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

void main();
