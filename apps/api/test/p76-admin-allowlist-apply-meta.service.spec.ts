import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  deriveP76MainChainApplyStatus,
  deriveP76SidecarStatus,
  deriveP76ViolationStatus,
} from "../src/modules/matching/p76-admin-allowlist-apply-meta.derive";
import { P76AdminAllowlistApplyMetaService } from "../src/modules/matching/p76-admin-allowlist-apply-meta.service";
import type { P76AllowlistApplyMetaDbRow } from "../src/modules/matching/p76-admin-allowlist-apply-meta.types";
import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "../src/modules/matching/p76-allowlist-apply-meta.types";

function baseRow(
  overrides: Partial<P76AllowlistApplyMetaDbRow> = {},
): P76AllowlistApplyMetaDbRow {
  return {
    id: "row-1",
    viewerUserId: "viewer-1",
    selectedCandidateId: "cand-1",
    sourcePipeline: "p7.6_route_c",
    schemaVersion: "p7.6-allowlist-apply-meta-v1",
    sourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    routeCArtifactPath: null,
    stage1SelectedCandidateIds: ["cand-1", "cand-2"],
    stage2Top2CandidateIds: ["cand-1", "cand-2"],
    selectedBy20DOnlyCandidateId: "cand-1",
    selectedByRrmCandidateId: "cand-1",
    finalShadowSelectedCandidateId: "cand-1",
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

describe("p76-admin-allowlist-apply-meta derive", () => {
  it("deriveP76SidecarStatus written / dry_run / rolled_back", () => {
    expect(deriveP76SidecarStatus(baseRow())).toBe("written");
    expect(
      deriveP76SidecarStatus(baseRow({ applied: false, dryRun: true })),
    ).toBe("dry_run");
    expect(deriveP76SidecarStatus(baseRow({ rolledBack: true }))).toBe(
      "rolled_back",
    );
  });

  it("main-chain flags derive violation_detected", () => {
    expect(deriveP76MainChainApplyStatus(baseRow())).toBe("none");
    expect(
      deriveP76ViolationStatus(baseRow({ appliedToMatchResult: true })),
    ).toBe("p0_main_chain_flag");
    expect(
      deriveP76ViolationStatus(baseRow({ appliedToFinalScore: true })),
    ).toBe("p0_main_chain_flag");
    expect(
      deriveP76ViolationStatus(baseRow({ appliedToWorkerRanking: true })),
    ).toBe("p0_main_chain_flag");
    expect(
      deriveP76ViolationStatus(baseRow({ appliedToDisplay: true })),
    ).toBe("p0_main_chain_flag");
  });

  it("rolledBack derives rolled_back violation status", () => {
    expect(
      deriveP76ViolationStatus(baseRow({ rolledBack: true }), {
        artifactPathChecker: () => true,
      }),
    ).toBe("rolled_back");
  });
});

describe("P76AdminAllowlistApplyMetaService", () => {
  const rows = [
    baseRow({ id: "a", viewerUserId: "v1" }),
    baseRow({
      id: "b",
      viewerUserId: "v2",
      rolledBack: true,
      applied: false,
      dryRun: true,
    }),
    baseRow({
      id: "c",
      viewerUserId: "v3",
      appliedToMatchResult: true,
    }),
  ];

  const prisma = {
    p76AllowlistApplyMeta: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    matchResult: {
      update: jest.fn(),
    },
  };

  let service: P76AdminAllowlistApplyMetaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.p76AllowlistApplyMeta.findMany.mockResolvedValue(rows);
    const mod = await Test.createTestingModule({
      providers: [
        P76AdminAllowlistApplyMetaService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(P76AdminAllowlistApplyMetaService);
  });

  it("list returns rows + aggregate without writing DB", async () => {
    const out = await service.listP76AllowlistApplyMeta({ limit: 50 });
    expect(out.schemaVersion).toBe(
      "p7.6-r8g1-admin-allowlist-apply-meta-list-v1",
    );
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.aggregate.totalSidecarRows).toBe(3);
    expect(out.aggregate.mainChainViolationCount).toBe(1);
    expect(prisma.p76AllowlistApplyMeta.findMany).toHaveBeenCalled();
    expect(prisma.p76AllowlistApplyMeta.create).not.toHaveBeenCalled();
    expect(prisma.p76AllowlistApplyMeta.update).not.toHaveBeenCalled();
    expect(prisma.matchResult.update).not.toHaveBeenCalled();
  });

  it("violationOnly filters to non-ok rows", async () => {
    const out = await service.listP76AllowlistApplyMeta({
      violationOnly: true,
      limit: 50,
    });
    expect(out.rows.every((r) => r.violationStatus !== "ok")).toBe(true);
    expect(out.rows.length).toBe(2);
  });

  it("limit capped at 100", async () => {
    const out = await service.listP76AllowlistApplyMeta({ limit: 500 });
    expect(out.pagination.limit).toBe(100);
  });

  it("detail returns derived statuses", async () => {
    prisma.p76AllowlistApplyMeta.findUnique.mockResolvedValue(rows[0]);
    const out = await service.getP76AllowlistApplyMetaById("a");
    expect(out.schemaVersion).toBe(
      "p7.6-r8g1-admin-allowlist-apply-meta-detail-v1",
    );
    expect(out.derived.sidecarStatus).toBe("written");
    expect(out.derived.productApplyStatus).toBe("not_applied");
    expect(out.violationStatus).toBe("ok");
    expect(out.stageSummary.stage1Count).toBe(2);
  });

  it("detail 404 when missing", async () => {
    prisma.p76AllowlistApplyMeta.findUnique.mockResolvedValue(null);
    await expect(
      service.getP76AllowlistApplyMetaById("missing"),
    ).rejects.toThrow(NotFoundException);
  });

  it("aggregate counts main-chain violations", async () => {
    const out = await service.getP76AllowlistApplyMetaAggregate({});
    expect(out.appliedToMatchResultTrueCount).toBe(1);
    expect(out.violationCount).toBe(2);
  });

  it("response is privacy safe", async () => {
    prisma.p76AllowlistApplyMeta.findMany.mockResolvedValue([
      baseRow({
        auditNotes: {
          pmReview: "ok",
          imageUrl: "should-not-appear",
        } as never,
      }),
    ]);
    const out = await service.listP76AllowlistApplyMeta({ limit: 10 });
    expect(out.rows[0]!.auditNotes).toEqual({ pmReview: "ok" });
    expect(JSON.stringify(out)).not.toContain("imageUrl");
  });
});
