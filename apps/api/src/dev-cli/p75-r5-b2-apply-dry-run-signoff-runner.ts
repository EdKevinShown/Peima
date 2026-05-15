/**
 * DEV-ONLY · P7.5-r5-b2 — Run five APPLY_TO_POOL dry-run env cases against real `generate()`,
 * read persisted shadow `summary.applyDryRun`, verify pool items + active audit.
 *
 * Usage (after `pnpm --filter @peima/api run build`):
 *   cd apps/api
 *   npx dotenv-cli -e ../../.env -- node dist/dev-cli/p75-r5-b2-apply-dry-run-signoff-runner.js --viewerUserId=<cuid> [--mappingPath=...]
 *
 * Requires: DATABASE_URL, shadow-capable `.env` (see P7.5-r4-e), ≥6 gated candidates, valid viewer.
 */

import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import { parseCandidateMappingJson } from "../modules/dev/p75-r4-h-candidate-image-import.plan";
import { maskPreviewUserId } from "../modules/onboarding/onboarding-photo-preview-pool-funnel.audit";
import type { ActivePoolAuditReport } from "../modules/onboarding/onboarding-photo-preview-pool-active-audit";
import { OnboardingPhotoPreviewPoolActiveAuditService } from "../modules/onboarding/onboarding-photo-preview-pool-active-audit.service";
import { ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION } from "../modules/onboarding/onboarding-photo-preview-pool.service";
import { OnboardingPhotoPreviewPoolService } from "../modules/onboarding/onboarding-photo-preview-pool.service";
import { VISUAL_RANKING_SHADOW_SOURCE_VERSION } from "../modules/onboarding/vision/visual-ranking-shadow.types";
import { VISUAL_RANKING_SHADOW_TYPE } from "../modules/onboarding/vision/visual-ranking-shadow-persist";
import {
  applyR5B2CaseEnv,
  restoreApplyEnv,
  snapshotApplyEnv,
} from "./p75-r5-b2-apply-dry-run-signoff-env";
import { P75R5B2ApplyDryRunSignoffRunnerModule } from "./p75-r5-b2-apply-dry-run-signoff-runner.module";
import { PrismaService } from "../common/prisma/prisma.service";

export const R5_B2_SIGNOFF_SCHEMA_VERSION =
  "p7.5-r5-b2-apply-dry-run-signoff-v1" as const;

type ShadowPayloadSummary = {
  appliedToPool?: boolean;
  summary?: {
    applyDryRun?: {
      evaluated?: boolean;
      eligible?: boolean;
      reason?: string;
      appliedToPool?: boolean;
      applySourceVersion?: string;
    };
    applyToPoolIgnored?: boolean;
  };
  slots?: Array<{
    rankInPool: number;
    baselineCandidateUserId: string;
    shadowCandidateUserId: string;
    wouldChange: boolean;
  }>;
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
  return path.resolve(__dirname, "../../../dev-assets/test-user-images/mapping.json");
}

function parseArgs(argv: string[]): {
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

function activeAuditPass(report: ActivePoolAuditReport): boolean {
  if (report.pool_item_count !== 6) return false;
  for (const it of report.items) {
    if (
      it.duplicate_candidate_user_id ||
      it.duplicate_image_source_key ||
      it.violates_opposite_gender_gate ||
      it.is_viewer_self
    ) {
      return false;
    }
  }
  return true;
}

function realItemsUnchanged(
  pool: {
    sourceVersion: string;
    items: Array<{
      rankInPool: number;
      candidateUserId: string;
      reasonTags: string[];
    }>;
  },
  payload: ShadowPayloadSummary,
): boolean {
  if (pool.sourceVersion !== ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION) return false;
  if (!payload.slots || payload.slots.length !== 6) return false;
  if (pool.items.length !== 6) return false;
  const byRank = new Map(pool.items.map((i) => [i.rankInPool, i]));
  for (const s of payload.slots) {
    const it = byRank.get(s.rankInPool);
    if (!it) return false;
    if (it.candidateUserId !== s.baselineCandidateUserId) return false;
    if (!it.reasonTags?.includes("onboarding-photo-preview-v1")) return false;
  }
  return true;
}

type CaseSpec = {
  caseId: "A" | "B" | "C" | "D" | "E";
  expectedReason: string;
  expectedEligible: boolean;
  applyToPool: string;
  allowlist?: string;
  allowlistDefined?: boolean;
  percent?: string;
  percentDefined?: boolean;
};

function buildCases(viewerUserId: string): CaseSpec[] {
  return [
    {
      caseId: "A",
      expectedReason: "env_disabled",
      expectedEligible: false,
      applyToPool: "0",
      allowlistDefined: false,
      percentDefined: false,
    },
    {
      caseId: "B",
      expectedReason: "ok",
      expectedEligible: true,
      applyToPool: "1",
      allowlist: viewerUserId,
      percent: "0",
    },
    {
      caseId: "C",
      expectedReason: "not_in_allowlist",
      expectedEligible: false,
      applyToPool: "1",
      allowlist: "some-other-user",
      percent: "100",
    },
    {
      caseId: "D",
      expectedReason: "ok",
      expectedEligible: true,
      applyToPool: "1",
      allowlistDefined: false,
      percent: "100",
    },
    {
      caseId: "E",
      expectedReason: "percent_not_hit",
      expectedEligible: false,
      applyToPool: "1",
      allowlistDefined: false,
      percent: "0",
    },
  ];
}

async function loadShadowPayload(
  prisma: PrismaService,
  poolId: string,
): Promise<ShadowPayloadSummary | null> {
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
  return row.payloadJson as ShadowPayloadSummary;
}

async function loadActivePoolWithItems(
  prisma: PrismaService,
  viewerUserId: string,
): Promise<{
  sourceVersion: string;
  items: Array<{
    rankInPool: number;
    candidateUserId: string;
    reasonTags: string[];
  }>;
} | null> {
  const pool = await prisma.onboardingPhotoPreviewPool.findFirst({
    where: { userId: viewerUserId, status: "active" },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { rankInPool: "asc" } } },
  });
  if (!pool) return null;
  return {
    sourceVersion: pool.sourceVersion,
    items: pool.items.map((i) => ({
      rankInPool: i.rankInPool,
      candidateUserId: i.candidateUserId,
      reasonTags: i.reasonTags,
    })),
  };
}

async function main(): Promise<void> {
  loadDotenvFromCommonLocations();

  const { viewerUserId, mappingPath } = parseArgs(process.argv.slice(2));
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
        schemaVersion: R5_B2_SIGNOFF_SCHEMA_VERSION,
        error: "mapping_read_failed",
        mapping_path: mappingPath,
        message: e instanceof Error ? e.message : "unknown",
      }),
    );
    process.exit(1);
  }

  const snap = snapshotApplyEnv();
  const app = await NestFactory.createApplicationContext(
    P75R5B2ApplyDryRunSignoffRunnerModule,
    { logger: false },
  );

  const poolSvc = app.get(OnboardingPhotoPreviewPoolService);
  const auditSvc = app.get(OnboardingPhotoPreviewPoolActiveAuditService);
  const prisma = app.get(PrismaService);

  const casesOut: Array<{
    caseId: string;
    expectedReason: string;
    actualReason: string | null;
    expectedEligible: boolean;
    actualEligible: boolean | null;
    appliedToPool: boolean | null;
    applyToPoolIgnored: boolean | null;
    realItemsChanged: boolean;
    activeAuditPass: boolean;
    result: "PASS" | "FAIL";
    poolIdMasked?: string;
    caseError?: string;
  }> = [];

  try {
    for (const c of buildCases(viewerUserId)) {
      restoreApplyEnv(snap);
      applyR5B2CaseEnv({
        applyToPool: c.applyToPool,
        allowlist: c.allowlist,
        allowlistDefined: c.allowlistDefined,
        percent: c.percent,
        percentDefined: c.percentDefined,
      });

      let poolIdMasked: string | undefined;
      let actualReason: string | null = null;
      let actualEligible: boolean | null = null;
      let appliedToPool: boolean | null = null;
      let applyToPoolIgnored: boolean | null = null;
      let realOk = false;
      let auditOk = false;
      let caseError: string | undefined;

      try {
        const bundle = await poolSvc.generate(viewerUserId);
        poolIdMasked = maskPreviewUserId(bundle.pool.id);

        const payload = await loadShadowPayload(prisma, bundle.pool.id);
        const poolRow = await loadActivePoolWithItems(prisma, viewerUserId);
        const audit = await auditSvc.auditActivePoolForViewer(
          viewerUserId,
          mappingItems,
        );

        auditOk = activeAuditPass(audit);
        if (poolRow && payload) {
          realOk = realItemsUnchanged(poolRow, payload);
        }

        const ad = payload?.summary?.applyDryRun;
        if (ad?.reason !== undefined) actualReason = ad.reason;
        if (ad?.eligible !== undefined) actualEligible = ad.eligible;
        appliedToPool =
          typeof payload?.appliedToPool === "boolean"
            ? payload.appliedToPool
            : null;
        applyToPoolIgnored =
          payload?.summary?.applyToPoolIgnored === true ? true : false;

        const dryEvalOk =
          ad?.evaluated === true && ad.appliedToPool === false;
        const reasonOk = actualReason === c.expectedReason;
        const eligibleOk = actualEligible === c.expectedEligible;
        const appliedOk =
          payload != null &&
          payload.appliedToPool === false &&
          dryEvalOk;
        const ignoredOk =
          c.applyToPool === "0"
            ? applyToPoolIgnored !== true
            : applyToPoolIgnored === true;
        const pass =
          dryEvalOk &&
          reasonOk &&
          eligibleOk &&
          appliedOk &&
          ignoredOk &&
          realOk &&
          auditOk &&
          payload != null &&
          poolRow != null;

        if (!pass && !caseError) {
          const bits: string[] = [];
          if (!payload) bits.push("shadow_payload_missing");
          if (!poolRow) bits.push("active_pool_missing");
          if (!dryEvalOk) bits.push("apply_dry_run_invalid");
          if (!reasonOk) bits.push("reason_mismatch");
          if (!eligibleOk) bits.push("eligible_mismatch");
          if (!appliedOk) bits.push("applied_to_pool_not_false");
          if (!ignoredOk) bits.push("apply_to_pool_ignored_mismatch");
          if (!realOk) bits.push("real_items_or_baseline_mismatch");
          if (!auditOk) bits.push("active_audit_failed");
          caseError = bits.join(";") || "assert_failed";
        }

        casesOut.push({
          caseId: c.caseId,
          expectedReason: c.expectedReason,
          actualReason,
          expectedEligible: c.expectedEligible,
          actualEligible,
          appliedToPool,
          applyToPoolIgnored,
          realItemsChanged: !realOk,
          activeAuditPass: auditOk,
          result: pass ? "PASS" : "FAIL",
          poolIdMasked,
          ...(pass ? {} : { caseError }),
        });
      } catch (e) {
        caseError = e instanceof Error ? e.message : String(e);
        casesOut.push({
          caseId: c.caseId,
          expectedReason: c.expectedReason,
          actualReason,
          expectedEligible: c.expectedEligible,
          actualEligible,
          appliedToPool,
          applyToPoolIgnored,
          realItemsChanged: true,
          activeAuditPass: false,
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
  }

  const appliedToPoolAllFalse = casesOut.every(
    (x) => x.appliedToPool === false,
  );
  const realItemsUnchangedAllCases = casesOut.every((x) => !x.realItemsChanged);
  const activeAuditPassAllCases = casesOut.every((x) => x.activeAuditPass);
  const allPass =
    casesOut.length > 0 &&
    casesOut.every((x) => x.result === "PASS") &&
    appliedToPoolAllFalse;

  const out = {
    schemaVersion: R5_B2_SIGNOFF_SCHEMA_VERSION,
    viewerIdMasked: maskPreviewUserId(viewerUserId),
    cases: casesOut,
    summary: {
      allPass,
      appliedToPoolAllFalse,
      realItemsUnchangedAllCases,
      activeAuditPassAllCases,
    },
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(allPass ? 0 : 1);
}

void main();
