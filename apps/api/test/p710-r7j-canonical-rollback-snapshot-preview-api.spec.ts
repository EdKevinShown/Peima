/**
 * P7.10-r7j — canonical rollback-snapshot-preview read-only API.
 */
import { NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { Permission } from "@peima/shared/constants";
import { JwtAuthGuard } from "../src/modules/auth/jwt-auth.guard";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { RbacGuard, REQUIRED_PERMISSION_KEY } from "../src/common/rbac/rbac.guard";
import { P76CanonicalApplyPreviewService } from "../src/modules/matching/p76-canonical-apply-preview.service";
import { P76CanonicalRollbackSnapshotPreviewController } from "../src/modules/matching/p76-canonical-rollback-snapshot-preview.controller";
import { P76CanonicalRollbackSnapshotPreviewService } from "../src/modules/matching/p76-canonical-rollback-snapshot-preview.service";
import {
  P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_TYPE,
  P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_VERSION,
} from "../src/modules/matching/p76-canonical-apply-rollback-snapshot.types";
import type { P76CanonicalMatchResultMetaDbRow } from "../src/modules/matching/p76-canonical-sidecar-admin.types";

function baseSidecar(
  overrides: Partial<P76CanonicalMatchResultMetaDbRow> = {},
): P76CanonicalMatchResultMetaDbRow {
  return {
    id: "sidecar-r7j",
    auditRunId: "audit-r7j",
    environment: "dev",
    viewerUserId: "viewer-r7j",
    matchResultId: "mr-r7j",
    selectedCandidateId: "cand-new-r7j",
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
    rollbackToken: "secret-rollback-token-plaintext",
    previousSnapshotHash: "hash-secret-r7j",
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
  id: "mr-r7j",
  userId: "viewer-r7j",
  candidateUserId: "cand-old-r7j",
  finalScore: 0.7,
  reasonSummary: "worker baseline",
  matchInsights: { version: 1 },
  updatedAt: new Date("2026-05-19T11:00:00.000Z"),
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

describe("P76CanonicalRollbackSnapshotPreviewController", () => {
  it("uses VIEW_P76_CANONICAL_REHEARSAL on rollback-snapshot-preview", () => {
    const meta = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      P76CanonicalRollbackSnapshotPreviewController.prototype.rollbackSnapshotPreview,
    );
    expect(meta).toBe(Permission.VIEW_P76_CANONICAL_REHEARSAL);
  });

  it("delegates to rollback snapshot preview service", async () => {
    const snapshot = {
      schemaVersion: 1,
      mode: "dry_run" as const,
      snapshotReady: false,
    };
    const svc = {
      getRollbackSnapshotPreviewBySidecarId: jest.fn().mockResolvedValue(snapshot),
    };
    const mod = await Test.createTestingModule({
      controllers: [P76CanonicalRollbackSnapshotPreviewController],
      providers: [
        { provide: P76CanonicalRollbackSnapshotPreviewService, useValue: svc },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const c = mod.get(P76CanonicalRollbackSnapshotPreviewController);
    await c.rollbackSnapshotPreview("sidecar-r7j");
    expect(svc.getRollbackSnapshotPreviewBySidecarId).toHaveBeenCalledWith(
      "sidecar-r7j",
    );
  });

  it("registers JwtAuthGuard + RbacGuard (HTTP 401/403 enforced outside unit call)", () => {
    const classGuards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        P76CanonicalRollbackSnapshotPreviewController,
      ) ?? [];
    expect(classGuards).toEqual(
      expect.arrayContaining([JwtAuthGuard, RbacGuard]),
    );
  });
});

describe("P76CanonicalRollbackSnapshotPreviewService", () => {
  const sidecarFindUnique = jest.fn();
  const matchResultFindUnique = jest.fn();
  const metaUpdate = jest.fn();
  const metaCreate = jest.fn();
  const metaDelete = jest.fn();
  const matchResultUpdate = jest.fn();
  const matchResultCreate = jest.fn();
  const matchResultDelete = jest.fn();

  let service: P76CanonicalRollbackSnapshotPreviewService;
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
        P76CanonicalRollbackSnapshotPreviewService,
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
    service = moduleRef.get(P76CanonicalRollbackSnapshotPreviewService);
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
    await expect(
      service.getRollbackSnapshotPreviewBySidecarId("x"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sidecarFindUnique).not.toHaveBeenCalled();
  });

  it("sidecar missing → 404", async () => {
    sidecarFindUnique.mockResolvedValue(null);
    await expect(
      service.getRollbackSnapshotPreviewBySidecarId("missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("sidecar + MatchResult + gates pass → 200 snapshotReady true", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getRollbackSnapshotPreviewBySidecarId("sidecar-r7j", {
      context: allGatesPassContext(),
    });
    expect(out.schemaVersion).toBe(1);
    expect(out.sourceType).toBe(P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_TYPE);
    expect(out.sourceVersion).toBe(
      P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_SOURCE_VERSION,
    );
    expect(out.mode).toBe("dry_run");
    expect(out.snapshotReady).toBe(true);
    expect(out.blockedReasons).toEqual([]);
    expect(out.sidecarId).toBe("sidecar-r7j");
    expect(out.matchResultId).toBe("mr-r7j");
    expect(out.before.candidateUserId).toBe("cand-old-r7j");
    expect(out.proposedAfter.candidateUserId).toBe("cand-new-r7j");
  });

  it("MatchResult missing → 200 snapshotReady false + missing_current_match_result", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(null);
    const out = await service.getRollbackSnapshotPreviewBySidecarId("sidecar-r7j");
    expect(out.snapshotReady).toBe(false);
    expect(out.blockedReasons).toContain("missing_current_match_result");
  });

  it("preview canApply=false → snapshotReady false + preview_not_ready", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getRollbackSnapshotPreviewBySidecarId("sidecar-r7j");
    expect(out.snapshotReady).toBe(false);
    expect(out.blockedReasons).toContain("preview_not_ready");
  });

  it("blocks rolledBack sidecar", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar({ rolledBack: true }));
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getRollbackSnapshotPreviewBySidecarId("sidecar-r7j");
    expect(out.snapshotReady).toBe(false);
    expect(out.blockedReasons).toContain("sidecar_rolled_back");
  });

  it("blocks already promoted sidecar", async () => {
    sidecarFindUnique.mockResolvedValue(
      baseSidecar({ promotionStatus: "promoted" }),
    );
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getRollbackSnapshotPreviewBySidecarId("sidecar-r7j");
    expect(out.snapshotReady).toBe(false);
    expect(out.blockedReasons).toContain("sidecar_already_promoted");
  });

  it("blocks appliedTo* flags", async () => {
    for (const [field, reason] of [
      ["appliedToMatchResult", "sidecar_applied_to_match_result"],
      ["appliedToFinalScore", "sidecar_applied_to_final_score"],
      ["appliedToWorkerRanking", "sidecar_applied_to_worker_ranking"],
    ] as const) {
      sidecarFindUnique.mockResolvedValue(baseSidecar({ [field]: true }));
      matchResultFindUnique.mockResolvedValue(baseMatchResult);
      const out = await service.getRollbackSnapshotPreviewBySidecarId("sidecar-r7j");
      expect(out.blockedReasons).toContain(reason);
    }
  });

  it("rollbackTokenPreview always redacted", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getRollbackSnapshotPreviewBySidecarId("sidecar-r7j", {
      context: allGatesPassContext(),
    });
    expect(out.rollback.rollbackTokenPreview).toBe("redacted");
    expect(out.rollback.rollbackTokenHash).toBeNull();
  });

  it("no rollback token plaintext in response", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getRollbackSnapshotPreviewBySidecarId("sidecar-r7j", {
      context: allGatesPassContext(),
    });
    const json = JSON.stringify(out);
    expect(json).not.toContain("secret-rollback-token-plaintext");
    expect(json).not.toContain("hash-secret-r7j");
  });

  it("safety all false", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    const out = await service.getRollbackSnapshotPreviewBySidecarId("sidecar-r7j");
    expect(out.safety).toEqual({
      writesDb: false,
      writesMatchResult: false,
      writesFinalScore: false,
      triggersWorker: false,
      changesPercent: false,
      productionRollout: false,
    });
  });

  it("does not mutate sidecar row", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    await service.getRollbackSnapshotPreviewBySidecarId("sidecar-r7j");
    expect(metaUpdate).not.toHaveBeenCalled();
    expect(metaCreate).not.toHaveBeenCalled();
    expect(metaDelete).not.toHaveBeenCalled();
  });

  it("does not mutate MatchResult / finalScore", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    await service.getRollbackSnapshotPreviewBySidecarId("sidecar-r7j");
    expect(matchResultUpdate).not.toHaveBeenCalled();
    expect(matchResultCreate).not.toHaveBeenCalled();
    expect(matchResultDelete).not.toHaveBeenCalled();
  });

  it("only uses findUnique on sidecar and matchResult", async () => {
    sidecarFindUnique.mockResolvedValue(baseSidecar());
    matchResultFindUnique.mockResolvedValue(baseMatchResult);
    await service.getRollbackSnapshotPreviewBySidecarId("sidecar-r7j");
    expect(sidecarFindUnique).toHaveBeenCalled();
    expect(matchResultFindUnique).toHaveBeenCalled();
    expect(sidecarFindUnique.mock.calls.every((c) => c[0]?.where?.id)).toBe(true);
  });
});
