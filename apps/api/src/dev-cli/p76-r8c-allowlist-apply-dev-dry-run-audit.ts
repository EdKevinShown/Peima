/**
 * P7.6-r8c — dev dry-run audit helpers (Route C × 5 viewers).
 */

import * as fs from "fs";
import * as path from "path";
import type { P76AllowlistApplyEnv } from "../modules/matching/p76-allowlist-apply-env";
import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "../modules/matching/p76-allowlist-apply-meta.types";
import type { P76AllowlistApplyInputV1 } from "../modules/matching/p76-allowlist-apply-meta.types";
import type { P76AllowlistApplyWriterPrisma } from "../modules/matching/p76-allowlist-apply-writer";
import { writeP76AllowlistApplyMeta } from "../modules/matching/p76-allowlist-apply-writer";

export const P76_R8C_ROUTE_C_VIEWERS = [
  "cmr4hm001016z64demo00m05a",
  "cmfemn00100016z64seed0001",
  "cmr4hf000716z64demo00f04a",
  "cmr4hf000916z64demo00f05a",
  "cmr4r7j4050025z64stag0001",
] as const;

export type P76R8cViewerArtifactBundle = {
  viewerUserId: string;
  routeCArtifactPath: string;
  stage1SelectedCandidateIds: string[];
  stage2Top2CandidateIds: string[];
  selectedBy20DOnlyCandidateId: string | null;
  selectedByRrmCandidateId: string | null;
  finalShadowSelectedCandidateId: string;
};

export type P76R8cDryRunViewerResult = {
  viewerUserId: string;
  selectedCandidateId: string;
  allowlistMatched: boolean;
  wouldApply: boolean;
  wroteSidecar: boolean;
  blocked: boolean;
  blockedReasons: string[];
  applied: false;
  effectiveDryRun: boolean;
  phase: "default_disabled" | "allowlist_dry_run";
  notes: string;
};

export type P76R8cViolationCounts = {
  violationCount: number;
  appliedCount: number;
  rolledBackCount: number;
  nonAllowlistAppliedCount: number;
  tableExists: boolean;
  dbReachable: boolean;
  error: string | null;
};

export type P76R8cAuditReport = {
  schemaVersion: "p7.6-r8c-allowlist-apply-dev-dry-run-audit-v1";
  generatedAt: string;
  migrationName: "20260517120000_p76_allowlist_apply_meta";
  migrationApplied: boolean;
  productionMigrationApplied: false;
  dbReachable: boolean;
  sidecarWriteSmoke: "skipped";
  defaultDisabledResults: P76R8cDryRunViewerResult[];
  allowlistDryRunResults: P76R8cDryRunViewerResult[];
  violation: P76R8cViolationCounts;
};

function readJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as T;
}

export function resolveRepoRootFromDistDevCli(): string {
  return path.resolve(__dirname, "../../../..");
}

export function loadP76R8cViewerArtifactBundle(
  repoRoot: string,
  viewerUserId: string,
): P76R8cViewerArtifactBundle {
  const base = path.join(repoRoot, "artifacts/p76/r7g", viewerUserId);
  const stage1 = readJson<{ selectedCandidateIds: string[] }>(
    path.join(base, "r7g2-stage1.json"),
  );
  const r4b = readJson<{
    top2CandidateIds: string[];
    selectedBy20DOnlyCandidateId: string;
  }>(path.join(base, "r4b.json"));
  const r5b = readJson<{ selectedByRrmCandidateId: string }>(
    path.join(base, "r5b.json"),
  );
  const r6b = readJson<{
    finalShadow: { selectedCandidateId: string };
  }>(path.join(base, "r6b.json"));

  const finalId = r6b.finalShadow.selectedCandidateId;

  return {
    viewerUserId,
    routeCArtifactPath: `artifacts/p76/r7g/${viewerUserId}`,
    stage1SelectedCandidateIds: stage1.selectedCandidateIds,
    stage2Top2CandidateIds: r4b.top2CandidateIds,
    selectedBy20DOnlyCandidateId: r4b.selectedBy20DOnlyCandidateId ?? null,
    selectedByRrmCandidateId: r5b.selectedByRrmCandidateId ?? null,
    finalShadowSelectedCandidateId: finalId,
  };
}

export function buildP76R8cWriterInput(
  bundle: P76R8cViewerArtifactBundle,
  cliDryRun: boolean,
): P76AllowlistApplyInputV1 {
  return {
    viewerUserId: bundle.viewerUserId,
    selectedCandidateId: bundle.finalShadowSelectedCandidateId,
    sourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    routeCArtifactPath: bundle.routeCArtifactPath,
    stage1SelectedCandidateIds: bundle.stage1SelectedCandidateIds,
    stage2Top2CandidateIds: bundle.stage2Top2CandidateIds,
    selectedBy20DOnlyCandidateId: bundle.selectedBy20DOnlyCandidateId,
    selectedByRrmCandidateId: bundle.selectedByRrmCandidateId,
    finalShadowSelectedCandidateId: bundle.finalShadowSelectedCandidateId,
    pmSignoffStatus: "approved",
    opsSignoffStatus: "approved",
    cliDryRun,
  };
}

/** In-memory mock — tracks upsert calls (must stay 0 for dry-run audit). */
export function createP76R8cInMemoryMockPrisma(): P76AllowlistApplyWriterPrisma & {
  upsertCalls: number;
} {
  const state = { upsertCalls: 0 };
  return {
    get upsertCalls() {
      return state.upsertCalls;
    },
    p76AllowlistApplyMeta: {
      findUnique: async () => null,
      upsert: async () => {
        state.upsertCalls += 1;
        return { id: "mock-row" };
      },
      update: async () => ({ id: "mock-row" }),
    },
  };
}

export async function runP76R8cWriterPhase(
  bundles: P76R8cViewerArtifactBundle[],
  env: P76AllowlistApplyEnv,
  phase: P76R8cDryRunViewerResult["phase"],
  prisma: P76AllowlistApplyWriterPrisma & { upsertCalls?: number },
): Promise<P76R8cDryRunViewerResult[]> {
  const results: P76R8cDryRunViewerResult[] = [];
  const upsertBefore =
    "upsertCalls" in prisma ? (prisma.upsertCalls ?? 0) : 0;

  for (const bundle of bundles) {
    const input = buildP76R8cWriterInput(bundle, false);
    const out = await writeP76AllowlistApplyMeta(prisma, input, env);
    results.push({
      viewerUserId: bundle.viewerUserId,
      selectedCandidateId: bundle.finalShadowSelectedCandidateId,
      allowlistMatched: out.allowlistMatched,
      wouldApply: out.wouldApply,
      wroteSidecar: out.wroteSidecar,
      blocked: out.blocked,
      blockedReasons: out.blockedReasons,
      applied: false,
      effectiveDryRun: out.effectiveDryRun,
      phase,
      notes:
        phase === "default_disabled"
          ? "ENABLED=0 default"
          : "ENABLED=1 DRY_RUN=1 allowlist",
    });
  }

  if ("upsertCalls" in prisma) {
    const upsertDelta = (prisma.upsertCalls ?? 0) - upsertBefore;
    if (upsertDelta > 0) {
      throw new Error(`unexpected sidecar upsert count: ${upsertDelta}`);
    }
  }

  return results;
}

export async function queryP76R8cViolations(
  prisma: {
    $queryRawUnsafe: (query: string) => Promise<unknown[]>;
  },
): Promise<P76R8cViolationCounts> {
  try {
    const tableRows = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'p76_allowlist_apply_meta'
      ) AS exists
    `);
    const tableExists = Boolean(
      (tableRows[0] as { exists?: boolean })?.exists,
    );
    if (!tableExists) {
      return {
        violationCount: 0,
        appliedCount: 0,
        rolledBackCount: 0,
        nonAllowlistAppliedCount: 0,
        tableExists: false,
        dbReachable: true,
        error: null,
      };
    }

    const [v] = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS c FROM p76_allowlist_apply_meta
      WHERE "appliedToMatchResult" = true
         OR "appliedToFinalScore" = true
         OR "appliedToWorkerRanking" = true
    `);
    const [a] = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS c FROM p76_allowlist_apply_meta WHERE applied = true
    `);
    const [r] = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS c FROM p76_allowlist_apply_meta WHERE "rolledBack" = true
    `);
    const allowlist = P76_R8C_ROUTE_C_VIEWERS.map((id) => `'${id}'`).join(",");
    const [n] = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS c FROM p76_allowlist_apply_meta
      WHERE applied = true AND "viewerUserId" NOT IN (${allowlist})
    `);

    return {
      violationCount: Number((v as { c: number }).c),
      appliedCount: Number((a as { c: number }).c),
      rolledBackCount: Number((r as { c: number }).c),
      nonAllowlistAppliedCount: Number((n as { c: number }).c),
      tableExists: true,
      dbReachable: true,
      error: null,
    };
  } catch (err) {
    return {
      violationCount: 0,
      appliedCount: 0,
      rolledBackCount: 0,
      nonAllowlistAppliedCount: 0,
      tableExists: false,
      dbReachable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runP76R8cDevDryRunAudit(opts: {
  repoRoot: string;
  prisma?: P76AllowlistApplyWriterPrisma;
  queryPrisma?: { $queryRawUnsafe: (q: string) => Promise<unknown[]> };
  migrationApplied?: boolean;
}): Promise<P76R8cAuditReport> {
  const repoRoot = opts.repoRoot;
  const bundles = P76_R8C_ROUTE_C_VIEWERS.map((id) =>
    loadP76R8cViewerArtifactBundle(repoRoot, id),
  );

  const mockPrisma = opts.prisma ?? createP76R8cInMemoryMockPrisma();

  const defaultEnv: P76AllowlistApplyEnv = {
    enabled: false,
    dryRun: true,
    viewerAllowlist: [],
    poolSourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    requirePmSignoff: true,
    requireOpsSignoff: true,
  };

  const allowlistEnv: P76AllowlistApplyEnv = {
    enabled: true,
    dryRun: true,
    viewerAllowlist: [...P76_R8C_ROUTE_C_VIEWERS],
    poolSourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    requirePmSignoff: true,
    requireOpsSignoff: true,
  };

  const defaultDisabledResults = await runP76R8cWriterPhase(
    bundles,
    defaultEnv,
    "default_disabled",
    mockPrisma,
  );

  const allowlistDryRunResults = await runP76R8cWriterPhase(
    bundles,
    allowlistEnv,
    "allowlist_dry_run",
    mockPrisma,
  );

  let violation: P76R8cViolationCounts = {
    violationCount: 0,
    appliedCount: 0,
    rolledBackCount: 0,
    nonAllowlistAppliedCount: 0,
    tableExists: false,
    dbReachable: false,
    error: "no query prisma",
  };

  if (opts.queryPrisma) {
    violation = await queryP76R8cViolations(opts.queryPrisma);
  }

  return {
    schemaVersion: "p7.6-r8c-allowlist-apply-dev-dry-run-audit-v1",
    generatedAt: new Date().toISOString(),
    migrationName: "20260517120000_p76_allowlist_apply_meta",
    migrationApplied: opts.migrationApplied ?? violation.tableExists,
    productionMigrationApplied: false,
    dbReachable: violation.dbReachable,
    sidecarWriteSmoke: "skipped",
    defaultDisabledResults,
    allowlistDryRunResults,
    violation,
  };
}
