import type { MatchResult } from "@peima/database";
import {
  applyP76ReadPathDisplayOverlay,
  assertP76ReadPathDisplaySourceTypeSafe,
  deriveP76ReadPathFallbackReason,
  P76_READ_PATH_DISPLAY_SOURCE_TYPE,
  resolveP76AllowlistSidecarDisplayCandidate,
  validateP76SidecarReadEligibility,
} from "../src/modules/matching/p76-read-path-display-resolver";
import { readP76ReadPathEnv as readEnv } from "../src/modules/matching/p76-read-path-env";
import {
  resolveMatchResultDisplay,
} from "../src/modules/matching/matching-result-display";
import type { P76AllowlistApplyMetaDbRow } from "../src/modules/matching/p76-admin-allowlist-apply-meta.types";
import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "../src/modules/matching/p76-allowlist-apply-meta.types";

const VIEWER = "cmr4hm001016z64demo00m05a";
const CANDIDATE = "cand-p76-sidecar";
const LEGACY_CANDIDATE = "cand-static";

function baseRow(
  overrides: Partial<P76AllowlistApplyMetaDbRow> = {},
): P76AllowlistApplyMetaDbRow {
  return {
    id: "sidecar-row-1",
    viewerUserId: VIEWER,
    selectedCandidateId: CANDIDATE,
    sourcePipeline: "p7.6_route_c",
    schemaVersion: "p7.6-allowlist-apply-meta-v1",
    sourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    routeCArtifactPath: null,
    stage1SelectedCandidateIds: [CANDIDATE],
    stage2Top2CandidateIds: [CANDIDATE],
    selectedBy20DOnlyCandidateId: CANDIDATE,
    selectedByRrmCandidateId: CANDIDATE,
    finalShadowSelectedCandidateId: CANDIDATE,
    allowlistMatched: true,
    pmSignoffStatus: "approved",
    opsSignoffStatus: "approved",
    applied: true,
    appliedToPool: false,
    appliedToMatchResult: false,
    appliedToFinalScore: false,
    appliedToDisplay: false,
    appliedToWorkerRanking: false,
    dryRun: false,
    appliedAt: new Date("2026-05-18T00:00:00.000Z"),
    appliedBy: null,
    rolledBack: false,
    rolledBackAt: null,
    rolledBackBy: null,
    rollbackReason: null,
    rollbackToken: null,
    auditNotes: {},
    createdAt: new Date("2026-05-18T00:00:00.000Z"),
    updatedAt: new Date("2026-05-18T00:00:00.000Z"),
    ...overrides,
  };
}

function enabledEnv(over: Partial<ReturnType<typeof readEnv>> = {}) {
  return {
    enabled: true,
    viewerAllowlist: [VIEWER],
    sourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    requirePmSignoff: true,
    requireOpsSignoff: true,
    fallbackLegacy: true,
    strictViolationBlock: true,
    ...over,
  };
}

function legacyDisplay() {
  return {
    displayCandidateUserId: LEGACY_CANDIDATE,
    displaySourceType: "match_result_original",
    finalMatchDecisionMeta: null,
  };
}

function mr(over: Partial<MatchResult> = {}): MatchResult {
  return {
    id: "mr-1",
    userId: VIEWER,
    candidateUserId: LEGACY_CANDIDATE,
    batchId: "batch-1",
    finalScore: 0.82,
    reasonSummary: "ok",
    status: "active",
    matchInsights: {},
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...over,
  } as MatchResult;
}

describe("p76-read-path-env", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("defaults to disabled with empty allowlist", () => {
    delete process.env.PEIMA_P76_READ_PATH_ENABLED;
    delete process.env.PEIMA_P76_READ_PATH_VIEWER_IDS;
    const env = readEnv();
    expect(env.enabled).toBe(false);
    expect(env.viewerAllowlist).toEqual([]);
    expect(env.fallbackLegacy).toBe(true);
    expect(env.strictViolationBlock).toBe(true);
  });
});

describe("p76-read-path-display-resolver", () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  function mockPrisma(row: P76AllowlistApplyMetaDbRow | null, candidateExists = true) {
    return {
      p76AllowlistApplyMeta: {
        findUnique: jest.fn().mockResolvedValue(row),
      },
      user: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
          candidateExists && where.id === CANDIDATE
            ? Promise.resolve({ id: where.id })
            : Promise.resolve(null),
        ),
      },
    } as unknown as import("../src/common/prisma/prisma.service").PrismaService;
  }

  it("env disabled → legacy overlay ineligible", async () => {
    const prisma = mockPrisma(baseRow());
    const r = await resolveP76AllowlistSidecarDisplayCandidate(
      prisma,
      { viewerUserId: VIEWER, legacyDisplay: legacyDisplay() },
      enabledEnv({ enabled: false }),
    );
    expect(r.eligible).toBe(false);
    expect(r.fallbackReason).toBe("env_disabled");
  });

  it("viewer not allowlisted → legacy", async () => {
    const prisma = mockPrisma(baseRow());
    const r = await resolveP76AllowlistSidecarDisplayCandidate(
      prisma,
      { viewerUserId: VIEWER, legacyDisplay: legacyDisplay() },
      enabledEnv({ viewerAllowlist: ["other-viewer"] }),
    );
    expect(r.eligible).toBe(false);
    expect(r.fallbackReason).toBe("not_allowlisted");
  });

  it("no sidecar row → legacy", async () => {
    const prisma = mockPrisma(null);
    const r = await resolveP76AllowlistSidecarDisplayCandidate(
      prisma,
      { viewerUserId: VIEWER, legacyDisplay: legacyDisplay() },
      enabledEnv(),
    );
    expect(r.eligible).toBe(false);
    expect(r.fallbackReason).toBe("missing_sidecar");
  });

  it("sidecar exists + allowlist + approved signoffs → p76 display", async () => {
    const prisma = mockPrisma(baseRow());
    const r = await resolveP76AllowlistSidecarDisplayCandidate(
      prisma,
      { viewerUserId: VIEWER, legacyDisplay: legacyDisplay() },
      enabledEnv(),
    );
    expect(r.eligible).toBe(true);
    expect(r.displayCandidateUserId).toBe(CANDIDATE);
    expect(r.displaySourceType).toBe(P76_READ_PATH_DISPLAY_SOURCE_TYPE);
    expect(r.fallbackReason).toBeNull();
  });

  it("rolledBack=true → legacy", async () => {
    const prisma = mockPrisma(baseRow({ rolledBack: true, applied: false, dryRun: true }));
    const r = await resolveP76AllowlistSidecarDisplayCandidate(
      prisma,
      { viewerUserId: VIEWER, legacyDisplay: legacyDisplay() },
      enabledEnv(),
    );
    expect(r.eligible).toBe(false);
    expect(r.fallbackReason).toBe("rolled_back");
  });

  it.each([
    ["appliedToMatchResult", { appliedToMatchResult: true }],
    ["appliedToFinalScore", { appliedToFinalScore: true }],
    ["appliedToWorkerRanking", { appliedToWorkerRanking: true }],
    ["appliedToDisplay", { appliedToDisplay: true }],
  ] as const)("main chain %s → legacy", async (_label, patch) => {
    const prisma = mockPrisma(baseRow(patch));
    const r = await resolveP76AllowlistSidecarDisplayCandidate(
      prisma,
      { viewerUserId: VIEWER, legacyDisplay: legacyDisplay() },
      enabledEnv(),
    );
    expect(r.eligible).toBe(false);
    expect(r.fallbackReason).toMatch(/^main_chain_flag_/);
  });

  it("PM signoff missing → legacy", async () => {
    const prisma = mockPrisma(baseRow({ pmSignoffStatus: "pending" }));
    const r = await resolveP76AllowlistSidecarDisplayCandidate(
      prisma,
      { viewerUserId: VIEWER, legacyDisplay: legacyDisplay() },
      enabledEnv(),
    );
    expect(r.eligible).toBe(false);
    expect(r.fallbackReason).toBe("pm_signoff_pending");
  });

  it("Ops signoff missing → legacy", async () => {
    const prisma = mockPrisma(baseRow({ opsSignoffStatus: "rejected" }));
    const r = await resolveP76AllowlistSidecarDisplayCandidate(
      prisma,
      { viewerUserId: VIEWER, legacyDisplay: legacyDisplay() },
      enabledEnv(),
    );
    expect(r.eligible).toBe(false);
    expect(r.fallbackReason).toBe("ops_signoff_pending");
  });

  it("candidate missing → legacy", async () => {
    const prisma = mockPrisma(baseRow(), false);
    const r = await resolveP76AllowlistSidecarDisplayCandidate(
      prisma,
      { viewerUserId: VIEWER, legacyDisplay: legacyDisplay() },
      enabledEnv(),
    );
    expect(r.eligible).toBe(false);
    expect(r.fallbackReason).toBe("candidate_unavailable");
  });

  it("resolver exception → legacy via applyP76ReadPathDisplayOverlay", async () => {
    process.env.PEIMA_P76_READ_PATH_ENABLED = "1";
    process.env.PEIMA_P76_READ_PATH_VIEWER_IDS = VIEWER;
    const prisma = {
      p76AllowlistApplyMeta: {
        findUnique: jest.fn().mockRejectedValue(new Error("db down")),
      },
    } as unknown as import("../src/common/prisma/prisma.service").PrismaService;
    const legacy = legacyDisplay();
    const r = await applyP76ReadPathDisplayOverlay(prisma, {
      viewerUserId: VIEWER,
      legacyDisplay: legacy,
    });
    expect(r.displayCandidateUserId).toBe(LEGACY_CANDIDATE);
    expect(r.displaySourceType).toBe("match_result_original");
    expect(r.p76ReadPathMeta?.fallbackReason).toBe("exception");
  });

  it("displaySourceType never uses forbidden production naming", () => {
    expect(P76_READ_PATH_DISPLAY_SOURCE_TYPE).toBe("p76_allowlist_sidecar_readonly");
    assertP76ReadPathDisplaySourceTypeSafe(P76_READ_PATH_DISPLAY_SOURCE_TYPE);
    expect(() => assertP76ReadPathDisplaySourceTypeSafe("production_apply")).toThrow();
    expect(() => assertP76ReadPathDisplaySourceTypeSafe("percent_rollout")).toThrow();
  });

  it("validateP76SidecarReadEligibility does not treat DB applied=true alone as eligible", () => {
    const env = enabledEnv();
    const row = baseRow({ applied: true, dryRun: true, pmSignoffStatus: "pending" });
    const v = validateP76SidecarReadEligibility(row, env, {
      violationStatus: "ok",
      sidecarStatus: "dry_run",
      candidateFound: true,
    });
    expect(v.ok).toBe(false);
  });

  it("non-allowlist row flag → legacy", async () => {
    const prisma = mockPrisma(baseRow({ allowlistMatched: false }));
    const r = await resolveP76AllowlistSidecarDisplayCandidate(
      prisma,
      { viewerUserId: VIEWER, legacyDisplay: legacyDisplay() },
      enabledEnv(),
    );
    expect(r.eligible).toBe(false);
    expect(r.fallbackReason).toBe("non_allowlist_row");
  });
});

describe("resolveMatchResultDisplay + P7.6 read path", () => {
  const prev = {
    READ_ENABLED: process.env.PEIMA_P76_READ_PATH_ENABLED,
    READ_VIEWERS: process.env.PEIMA_P76_READ_PATH_VIEWER_IDS,
    PAIRWISE: process.env.PAIRWISE_FINAL_MATCH_ENABLED,
    MODE: process.env.PAIRWISE_FINAL_MATCH_MODE,
    RRM: process.env.PEIMA_M5_RRM_TOP2_ENABLED,
    M6: process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED,
  };

  afterEach(() => {
    if (prev.READ_ENABLED === undefined) delete process.env.PEIMA_P76_READ_PATH_ENABLED;
    else process.env.PEIMA_P76_READ_PATH_ENABLED = prev.READ_ENABLED;
    if (prev.READ_VIEWERS === undefined) delete process.env.PEIMA_P76_READ_PATH_VIEWER_IDS;
    else process.env.PEIMA_P76_READ_PATH_VIEWER_IDS = prev.READ_VIEWERS;
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = prev.PAIRWISE;
    process.env.PAIRWISE_FINAL_MATCH_MODE = prev.MODE;
    if (prev.RRM === undefined) delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
    else process.env.PEIMA_M5_RRM_TOP2_ENABLED = prev.RRM;
    if (prev.M6 === undefined) delete process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED;
    else process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED = prev.M6;
  });

  it("env disabled → legacy display from GET resolver", async () => {
    process.env.PEIMA_P76_READ_PATH_ENABLED = "0";
    delete process.env.PEIMA_P76_READ_PATH_VIEWER_IDS;
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "0";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "shadow";

    const prisma = {
      matchResultRrmTop2DisplayMeta: { findUnique: jest.fn().mockResolvedValue(null) },
      pairwisePoolFinalizeMeta: { findMany: jest.fn().mockResolvedValue([]) },
      p76AllowlistApplyMeta: { findUnique: jest.fn() },
    } as unknown as import("../src/common/prisma/prisma.service").PrismaService;

    const r = await resolveMatchResultDisplay(prisma, mr());
    expect(r.displayCandidateUserId).toBe(LEGACY_CANDIDATE);
    expect(r.displaySourceType).toBe("match_result_original");
    expect(prisma.p76AllowlistApplyMeta.findUnique).not.toHaveBeenCalled();
  });

  it("read path enabled + sidecar → overlay without changing match row candidate", async () => {
    process.env.PEIMA_P76_READ_PATH_ENABLED = "1";
    process.env.PEIMA_P76_READ_PATH_VIEWER_IDS = VIEWER;
    process.env.PAIRWISE_FINAL_MATCH_ENABLED = "0";
    process.env.PAIRWISE_FINAL_MATCH_MODE = "shadow";

    const row = baseRow();
    const prisma = {
      matchResultRrmTop2DisplayMeta: { findUnique: jest.fn().mockResolvedValue(null) },
      pairwisePoolFinalizeMeta: { findMany: jest.fn().mockResolvedValue([]) },
      p76AllowlistApplyMeta: { findUnique: jest.fn().mockResolvedValue(row) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: CANDIDATE }),
      },
    } as unknown as import("../src/common/prisma/prisma.service").PrismaService;

    const matchRow = mr();
    const r = await resolveMatchResultDisplay(prisma, matchRow);
    expect(matchRow.candidateUserId).toBe(LEGACY_CANDIDATE);
    expect(r.displayCandidateUserId).toBe(CANDIDATE);
    expect(r.displaySourceType).toBe("p76_allowlist_sidecar_readonly");
    expect(r.p76ReadPathMeta?.fallbackUsed).toBe(false);
  });
});
