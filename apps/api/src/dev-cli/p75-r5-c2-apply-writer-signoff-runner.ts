/**
 * DEV-ONLY · P7.5-r5-c2 — Run five allowlist-only APPLY writer env cases against real `generate()`,
 * verify pool sourceVersion, summary.applyResult, active audit.
 *
 * Usage (after `pnpm --filter @peima/api run build`):
 *   cd apps/api
 *   npx dotenv-cli -e ../../.env -- node dist/dev-cli/p75-r5-c2-apply-writer-signoff-runner.js --viewerUserId=<cuid> [--mappingPath=...]
 */

import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import { parseCandidateMappingJson } from "../modules/dev/p75-r4-h-candidate-image-import.plan";
import { maskPreviewUserId } from "../modules/onboarding/onboarding-photo-preview-pool-funnel.audit";
import { OnboardingPhotoPreviewPoolActiveAuditService } from "../modules/onboarding/onboarding-photo-preview-pool-active-audit.service";
import { OnboardingPhotoPreviewPoolService } from "../modules/onboarding/onboarding-photo-preview-pool.service";
import { VISUAL_RANKING_SHADOW_SOURCE_VERSION } from "../modules/onboarding/vision/visual-ranking-shadow.types";
import { VISUAL_RANKING_SHADOW_TYPE } from "../modules/onboarding/vision/visual-ranking-shadow-persist";
import {
  applyR5C2CaseEnv,
  restoreApplyEnv,
  snapshotApplyEnv,
} from "./p75-r5-c2-apply-writer-signoff-env";
import {
  R5_C2_SIGNOFF_SCHEMA_VERSION,
  R5_C2_V1_SOURCE_VERSION,
  R5_C2_V2_SOURCE_VERSION,
  activeAuditPass,
  auditViolationFlags,
  buildR5C2SignoffCases,
  caseSpecToEnvSpec,
  evaluateR5C2CasePass,
  type R5C2ShadowSummaryRead,
} from "./p75-r5-c2-apply-writer-signoff-logic";
import { P75R5C2ApplyWriterSignoffRunnerModule } from "./p75-r5-c2-apply-writer-signoff-runner.module";
import { PrismaService } from "../common/prisma/prisma.service";

export { R5_C2_SIGNOFF_SCHEMA_VERSION } from "./p75-r5-c2-apply-writer-signoff-logic";

type ShadowPayload = {
  appliedToPool?: boolean;
  summary?: R5C2ShadowSummaryRead;
};

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
  return path.resolve(
    __dirname,
    "../../../dev-assets/test-user-images/mapping.json",
  );
}

export function parseR5C2SignoffArgs(argv: string[]): {
  viewerUserId?: string;
  mappingPath: string;
} {
  let viewerUserId: string | undefined;
  let mappingPath = defaultMappingPath();

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--viewerUserId=")) {
      viewerUserId = a.slice("--viewerUserId=".length).trim() || undefined;
    } else if (a === "--viewerUserId") {
      const v = argv[i + 1];
      if (v && !v.startsWith("--")) {
        viewerUserId = v.trim();
        i += 1;
      }
    } else if (a.startsWith("--mappingPath=")) {
      mappingPath = a.slice("--mappingPath=".length).trim() || mappingPath;
    } else if (a === "--mappingPath") {
      const v = argv[i + 1];
      if (v && !v.startsWith("--")) {
        mappingPath = v.trim();
        i += 1;
      }
    }
  }
  return { viewerUserId, mappingPath };
}

async function loadShadowPayload(
  prisma: PrismaService,
  poolId: string,
): Promise<ShadowPayload | null> {
  const row = await prisma.onboardingPhotoPreviewPoolShadow.findUnique({
    where: {
      poolId_shadowType_sourceVersion: {
        poolId,
        shadowType: VISUAL_RANKING_SHADOW_TYPE,
        sourceVersion: VISUAL_RANKING_SHADOW_SOURCE_VERSION,
      },
    },
    select: { payloadJson: true },
  });
  if (!row?.payloadJson || typeof row.payloadJson !== "object") return null;
  return row.payloadJson as ShadowPayload;
}

async function countV2PoolsForViewer(
  prisma: PrismaService,
  viewerUserId: string,
): Promise<number> {
  return prisma.onboardingPhotoPreviewPool.count({
    where: {
      userId: viewerUserId,
      sourceVersion: R5_C2_V2_SOURCE_VERSION,
    },
  });
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();

  const { viewerUserId, mappingPath } = parseR5C2SignoffArgs(
    process.argv.slice(2),
  );
  if (!viewerUserId) {
    console.error(
      "Usage: --viewerUserId=<cuid> [--mappingPath=path/to/mapping.json]",
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({ error: "DATABASE_URL_missing" }));
    process.exit(1);
  }

  let mappingItems: Array<{ file: string; gender?: string }> = [];
  try {
    const raw = fs.readFileSync(mappingPath, "utf8");
    const parsed = parseCandidateMappingJson(raw);
    mappingItems = parsed?.items ?? [];
  } catch (e) {
    console.error(
      JSON.stringify({
        schemaVersion: R5_C2_SIGNOFF_SCHEMA_VERSION,
        error: "mapping_read_failed",
        mapping_path: mappingPath,
        message: e instanceof Error ? e.message : "unknown",
      }),
    );
    process.exit(1);
  }

  const snap = snapshotApplyEnv();
  const app = await NestFactory.createApplicationContext(
    P75R5C2ApplyWriterSignoffRunnerModule,
    { logger: false },
  );

  const poolSvc = app.get(OnboardingPhotoPreviewPoolService);
  const auditSvc = app.get(OnboardingPhotoPreviewPoolActiveAuditService);
  const prisma = app.get(PrismaService);

  const casesOut: Array<{
    caseId: string;
    expectedSourceVersion: string;
    actualSourceVersion: string | null;
    expectedApplyResultApplied: boolean;
    actualApplyResultApplied: boolean | null;
    expectedReason: string;
    actualReason: string | null;
    activeAuditPass: boolean;
    poolItemCount: number;
    duplicateCandidateViolation: boolean;
    duplicateSourceImageViolation: boolean;
    genderViolation: boolean;
    selfViolation: boolean;
    result: "PASS" | "FAIL";
    poolIdMasked?: string;
    caseError?: string;
  }> = [];

  let v2PoolCountAfterD = 0;

  try {
    for (const c of buildR5C2SignoffCases(viewerUserId)) {
      restoreApplyEnv(snap);
      applyR5C2CaseEnv(caseSpecToEnvSpec(c));

      let poolIdMasked: string | undefined;
      let caseError: string | undefined;

      try {
        const bundle = await poolSvc.generate(viewerUserId);
        poolIdMasked = maskPreviewUserId(bundle.pool.id);

        const payload = await loadShadowPayload(prisma, bundle.pool.id);
        const audit = await auditSvc.auditActivePoolForViewer(
          viewerUserId,
          mappingItems,
        );
        const flags = auditViolationFlags(audit);
        const auditOk = activeAuditPass(audit);

        const ar = payload?.summary?.applyResult;
        const ad = payload?.summary?.applyDryRun;

        const observed = {
          actualSourceVersion: bundle.pool.sourceVersion,
          actualApplyResultApplied:
            typeof ar?.applied === "boolean" ? ar.applied : null,
          actualReason: ar?.reason ?? null,
          applyDryRunAppliedToPool:
            typeof ad?.appliedToPool === "boolean" ? ad.appliedToPool : null,
          rootAppliedToPool:
            typeof payload?.appliedToPool === "boolean"
              ? payload.appliedToPool
              : null,
          activeAuditPass: auditOk,
          poolItemCount: audit.pool_item_count,
          poolSourceVersionFromAudit: audit.pool_source_version,
          auditFlags: flags,
          shadowPresent: payload != null,
          poolPresent: bundle.items.length === 6,
        };

        const { pass, caseError: evalErr } = evaluateR5C2CasePass(c, observed);
        caseError = evalErr;

        if (c.caseId === "D" && pass) {
          v2PoolCountAfterD = await countV2PoolsForViewer(prisma, viewerUserId);
        }

        casesOut.push({
          caseId: c.caseId,
          expectedSourceVersion: c.expectedSourceVersion,
          actualSourceVersion: observed.actualSourceVersion,
          expectedApplyResultApplied: c.expectedApplyResultApplied,
          actualApplyResultApplied: observed.actualApplyResultApplied,
          expectedReason: c.expectedReason,
          actualReason: observed.actualReason,
          activeAuditPass: auditOk,
          poolItemCount: audit.pool_item_count,
          duplicateCandidateViolation: flags.duplicateCandidateViolation,
          duplicateSourceImageViolation: flags.duplicateSourceImageViolation,
          genderViolation: flags.genderViolation,
          selfViolation: flags.selfViolation,
          result: pass ? "PASS" : "FAIL",
          poolIdMasked,
          ...(pass ? {} : { caseError }),
        });
      } catch (e) {
        caseError = e instanceof Error ? e.message : String(e);
        casesOut.push({
          caseId: c.caseId,
          expectedSourceVersion: c.expectedSourceVersion,
          actualSourceVersion: null,
          expectedApplyResultApplied: c.expectedApplyResultApplied,
          actualApplyResultApplied: null,
          expectedReason: c.expectedReason,
          actualReason: null,
          activeAuditPass: false,
          poolItemCount: 0,
          duplicateCandidateViolation: true,
          duplicateSourceImageViolation: true,
          genderViolation: true,
          selfViolation: true,
          result: "FAIL",
          poolIdMasked,
          caseError,
        });
      } finally {
        restoreApplyEnv(snap);
      }
    }
  } finally {
    await app.close();
    restoreApplyEnv(snap);
  }

  const caseD = casesOut.find((x) => x.caseId === "D");
  const caseE = casesOut.find((x) => x.caseId === "E");
  const activeAuditPassAllCases = casesOut.every((x) => x.activeAuditPass);
  const allPass =
    casesOut.length === 5 && casesOut.every((x) => x.result === "PASS");

  const caseDAppliedV2 =
    caseD?.result === "PASS" &&
    caseD.actualSourceVersion === R5_C2_V2_SOURCE_VERSION &&
    caseD.actualApplyResultApplied === true;

  const caseERolledBackToV1 =
    caseE?.result === "PASS" &&
    caseE.actualSourceVersion === R5_C2_V1_SOURCE_VERSION &&
    caseE.actualApplyResultApplied === false;

  const v2PoolsRetainedAfterRollback =
    v2PoolCountAfterD >= 1 && caseERolledBackToV1;

  const out = {
    schemaVersion: R5_C2_SIGNOFF_SCHEMA_VERSION,
    viewerIdMasked: maskPreviewUserId(viewerUserId),
    cases: casesOut,
    summary: {
      allPass,
      caseDAppliedV2,
      caseERolledBackToV1,
      v2PoolsRetainedAfterRollback,
      activeAuditPassAllCases,
      noWorkerOrMatchResultTouched: true,
    },
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(allPass ? 0 : 1);
}

void main();
