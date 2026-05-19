/**
 * P7.10-r7f — canonical apply-preview read-only API (service + controller).
 */
import { NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { Permission } from "@peima/shared/constants";
import { JwtAuthGuard } from "../src/modules/auth/jwt-auth.guard";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { RbacGuard, REQUIRED_PERMISSION_KEY } from "../src/common/rbac/rbac.guard";
import { P76CanonicalApplyPreviewController } from "../src/modules/matching/p76-canonical-apply-preview.controller";
import { buildP76CanonicalApplyPreviewConservativeContext } from "../src/modules/matching/p76-canonical-apply-preview-context";
import { P76CanonicalApplyPreviewService } from "../src/modules/matching/p76-canonical-apply-preview.service";
import {
  P76_CANONICAL_APPLY_PREVIEW_SOURCE_TYPE,
  P76_CANONICAL_APPLY_PREVIEW_SOURCE_VERSION,
} from "../src/modules/matching/p76-canonical-apply-preview.types";
import type { P76CanonicalMatchResultMetaDbRow } from "../src/modules/matching/p76-canonical-sidecar-admin.types";

function baseSidecar(
  overrides: Partial<P76CanonicalMatchResultMetaDbRow> = {},
): P76CanonicalMatchResultMetaDbRow {
  return {
    id: "sidecar-r7f",
    auditRunId: "audit-r7f",
    environment: "dev",
    viewerUserId: "viewer-r7f",
    matchResultId: "mr-r7f",
    selectedCandidateId: "cand-new-r7f",
    sourceType: "p76_canonical_writer",
    sourceVersion: "p7.10-r3f1-canonical-sidecar-writer-v1",
    schemaVersion: 1,
    mode: "sidecar",
    score: 0.85,
    reasonSummary: "canonical proposal",
    stageSummary: null,
    safeFallbackMeta: null,
    guardrails: { eligible: true, reason: "ok" },
    dryRunPayload: null,
    appliedToMatchResult: false,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    promotionStatus: "not_promoted",
    promotionTargetMatchResultId: null,
    rollbackToken: "secret-token-never-in-response",
    previousSnapshotHash: "hash-secret",
    pmSignoffStatus: "approved",
    opsSignoffStatus: "approved",
    rolledBack: false,
    supersededAt: null,
    deletedAt: null,
    createdAt: new Date("2026-05-19T12:00:00.000Z"),
    updatedAt: new Date("2026-05-19T12:00:00.000Z"),
    ...overrides,
  };
}

const baseMatchResult = {
  id: "mr-r7f",
  userId: "viewer-r7f",
  candidateUserId: "cand-old-r7f",
  finalScore: 0.7,
  reasonSummary: "worker baseline",
  matchInsights: { version: 1 },
};

function allGatesPassContext() {
  return {
    gate12Status: "PASS",
    grafanaStatus: "PASS",
    pmSignoffRequired: true,
    opsSignoffRequired: true,
    productionWriteRequested: false,
    incidentActive: false,
    percentRolloutActive: false,
    workerDeployActive: false,
  };
}

describe("P76CanonicalApplyPreviewController", () => {
  it("uses VIEW_P76_CANONICAL_REHEARSAL on apply-preview", () => {
    const meta = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      P76CanonicalApplyPreviewController.prototype.applyPreview,
    );
    expect(meta).toBe(Permission.VIEW_P76_CANONICAL_REHEARSAL);
  });

  it("delegates to preview service", async () => {
    const preview = {
      schemaVersion: 1,
      mode: "preview" as const,
      canApply: false,
    };
    const svc = {
      getApplyPreviewBySidecarId: jest.fn().mockResolvedValue(preview),
    };
    const mod = await Test.createTestingModule({
      controllers: [P76CanonicalApplyPreviewController],
      providers: [{ provide: P76CanonicalApplyPreviewService, useValue: svc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const c = mod.get(P76CanonicalApplyPreviewController);
    await c.applyPreview("sidecar-r7f");
    expect(svc.getApplyPreviewBySidecarId).toHaveBeenCalledWith("sidecar-r7f");
  });

  it("registers JwtAuthGuard + RbacGuard (HTTP 401/403 enforced outside unit call)", () => {
    const classGuards =
      Reflect.getMetadata(GUARDS_METADATA, P76CanonicalApplyPreviewController) ?? [];
    expect(classGuards).toEqual(
      expect.arrayContaining([JwtAuthGuard, RbacGuard]),
    );
  });
});

describe("buildP76CanonicalApplyPreviewConservativeContext", () => {
  it("defaults to Gate 12 / Grafana blocked / production write blocked", () => {
    const ctx = buildP76CanonicalApplyPreviewConservativeContext({
      ...process.env,
      PEIMA_P76_APPLY_PREVIEW_GATE12_STATUS: undefined,
      PEIMA_P76_APPLY_PREVIEW_GRAFANA_STATUS: undefined,
      PEIMA_P76_APPLY_PREVIEW_PRODUCTION_WRITE_REQUESTED: undefined,
    } as NodeJS.ProcessEnv);
    expect(ctx.gate12Status).toBe("STAGING_GET_MATRIX_READY_MONITORING_PENDING");
    expect(ctx.grafanaStatus).toBe("P7_6_R9E3F2_BLOCKED_BY_MISSING_GRAFANA_ACCESS");
    expect(ctx.productionWriteRequested).toBe(true);
  });
});

describe("P76CanonicalApplyPreviewService", () => {
  const sidecarFindUnique = jest.fn();
  const matchResultFindUnique = jest.fn();
  const metaUpdate = jest.fn();
  const metaCreate = jest.fn();
  const metaDelete = jest.fn();
  const matchResultUpdate = jest.fn();
  const matchResultCreate = jest.fn();
  const matchResultDelete = jest.fn();

  let service: P76CanonicalApplyPreviewService;
  const prevAdmin = process.env.PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED;
  const envKeys = [
    "PEIMA_P76_APPLY_PREVIEW_GATE12_STATUS",
    "PEIMA_P76_APPLY_PREVIEW_GRAFANA_STATUS",
    "PEIMA_P76_APPLY_PREVIEW_PRODUCTION_WRITE_REQUESTED",
    "PEIMA_P76_APPLY_PREVIEW_PM_SIGNOFF_REQUIRED",
    "PEIMA_P76_APPLY_PREVIEW_OPS_SIGNOFF_REQUIRED",
  ] as const;
  const prevEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    process.env.PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED = "1";
    for (const k of envKeys) {
      prevEnv[k] = process.env[k];
      delete process.env[k];
    }
    sidecarFindUnique.mockReset();
    matchResultFindUnique.mockReset();
    metaUpdate.mockReset();
    metaCreate.mockReset();
    metaDelete.mockReset();
    matchResultUpdate.mockReset();
    matchResultCreate.mockReset();
    matchResultDelete.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        P76CanonicalApplyPreviewService,
        {
          provide: PrismaService,
          useValue: {
            p76CanonicalMatchResultMeta: {
              findUnique: sidecarFindUnique,
              update: metaUpdate,
              create: metaCreate,
              delete: metaDelete,
            },
            matchResult: {
              findUnique: matchResultFindUnique,
              update: matchResultUpdate,
              create: matchResultCreate,
              delete: matchResultDelete,
            },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(P76CanonicalApplyPreviewService);
  });

  afterEach(() => {
    process.env.PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED = prevAdmin;
    for (const k of envKeys) {
      if (prevEnv[k] === undefined) delete process.env[k];
      else process.env[k] = prevEnv[k];
    }
  });

  it("feature disabled → NotFound and no Prisma reads", async () => {
    process.env.PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED = "0";
    await expect(service.getApplyPreviewBySidecarId("x")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(sidecarFindUnique).not.toHaveBeenCalled();
  });

  it("sidecar missing → 404", async () => {
    sidecarFindUnique.mockResolvedValue(null);
    await expect(
      service.getApplyPreviewBySidecarId("missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("sidecar + MatchResult → 200 preview payload", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getApplyPreviewBySidecarId("sidecar-r7f");
    expect(out.schemaVersion).toBe(1);
    expect(out.sourceType).toBe(P76_CANONICAL_APPLY_PREVIEW_SOURCE_TYPE);
    expect(out.sourceVersion).toBe(P76_CANONICAL_APPLY_PREVIEW_SOURCE_VERSION);
    expect(out.mode).toBe("preview");
    expect(out.sidecar?.id).toBe("sidecar-r7f");
    expect(out.currentMatchResult?.id).toBe("mr-r7f");
    expect(out.proposedChange.candidateWouldChange).toBe(true);
  });

  it("missing MatchResult → preview with missing_match_result", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(null);
    const out = await service.getApplyPreviewBySidecarId("sidecar-r7f");
    expect(out.currentMatchResult).toBeNull();
    expect(out.canApply).toBe(false);
    expect(out.blockedReasons).toContain("missing_match_result");
  });

  it("conservative context → canApply false with gate12/grafana/production blocks", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getApplyPreviewBySidecarId("sidecar-r7f");
    expect(out.canApply).toBe(false);
    expect(out.blockedReasons).toContain("gate12_not_final");
    expect(out.blockedReasons).toContain("grafana_blocked");
    expect(out.blockedReasons).toContain("production_write_blocked");
  });

  it("canApply true only when all gates pass context injected", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getApplyPreviewBySidecarId("sidecar-r7f", {
      context: allGatesPassContext(),
    });
    expect(out.canApply).toBe(true);
    expect(out.blockedReasons).toEqual([]);
  });

  it("no-write safety all false", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getApplyPreviewBySidecarId("sidecar-r7f", {
      context: allGatesPassContext(),
    });
    expect(out.safety).toEqual({
      writesDb: false,
      writesMatchResult: false,
      writesFinalScore: false,
      triggersWorker: false,
      changesPercent: false,
      productionRollout: false,
    });
  });

  it("blocks already promoted sidecar", async () => {
    sidecarFindUnique.mockResolvedValue(
      baseSidecar({ promotionStatus: "promoted" }),
    );
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getApplyPreviewBySidecarId("sidecar-r7f");
    expect(out.canApply).toBe(false);
    expect(out.blockedReasons).toContain("sidecar_already_promoted");
  });

  it("blocks rolledBack sidecar", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar({ rolledBack: true }));
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getApplyPreviewBySidecarId("sidecar-r7f");
    expect(out.blockedReasons).toContain("sidecar_rolled_back");
  });

  it("blocks appliedTo* flags", async () => {
    for (const [field, reason] of [
      ["appliedToMatchResult", "sidecar_applied_to_match_result"],
      ["appliedToFinalScore", "sidecar_applied_to_final_score"],
      ["appliedToWorkerRanking", "sidecar_applied_to_worker_ranking"],
    ] as const) {
      sidecarFindUnique.mockResolvedValue(baseSidecar({ [field]: true }));
      matchResultFindUnique.mockResolvedValue(baseMatchResult);
      const out = await service.getApplyPreviewBySidecarId("sidecar-r7f");
      expect(out.blockedReasons).toContain(reason);
    }
  });

  it("rollbackPreview token is redacted only", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getApplyPreviewBySidecarId("sidecar-r7f", {
      context: allGatesPassContext(),
    });
    expect(out.rollbackPreview.rollbackTokenPreview).toBe("redacted");
    expect(JSON.stringify(out)).not.toContain("secret-token-never-in-response");
    expect(JSON.stringify(out)).not.toContain("hash-secret");
  });

  it("does not mutate sidecar or MatchResult", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    await service.getApplyPreviewBySidecarId("sidecar-r7f");
    expect(metaUpdate).not.toHaveBeenCalled();
    expect(metaCreate).not.toHaveBeenCalled();
    expect(metaDelete).not.toHaveBeenCalled();
    expect(matchResultUpdate).not.toHaveBeenCalled();
    expect(matchResultCreate).not.toHaveBeenCalled();
    expect(matchResultDelete).not.toHaveBeenCalled();
  });

  it("only uses findUnique on sidecar and matchResult", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    await service.getApplyPreviewBySidecarId("sidecar-r7f");
    expect(sidecarFindUnique).toHaveBeenCalledTimes(1);
    expect(matchResultFindUnique).toHaveBeenCalledTimes(1);
  });
});
