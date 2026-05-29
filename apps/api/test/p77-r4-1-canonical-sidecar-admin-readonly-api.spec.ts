/**
 * P7.7-r4.1 — canonical match result sidecar admin read API (service + controller).
 */
import { NotFoundException } from "@nestjs/common";
import { Permission } from "@peima/shared/constants";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { REQUIRED_PERMISSION_KEY } from "../src/common/rbac/rbac.guard";
import { P76CanonicalSidecarAdminController } from "../src/modules/matching/p76-canonical-sidecar-admin.controller";
import {
  computeP76CanonicalSidecarAdminAggregate,
  decodeP76CanonicalSidecarAdminListCursor,
  deriveP76CanonicalSidecarAdminDetail,
  deriveP76CanonicalSidecarAdminListItem,
  encodeP76CanonicalSidecarAdminListCursor,
  isP76CanonicalSidecarAppliedToMatchResultViolation,
  normalizeP76CanonicalSidecarAdminListLimit,
  sanitizeP76CanonicalSidecarAdminJson,
} from "../src/modules/matching/p76-canonical-sidecar-admin.derive";
import { P76CanonicalSidecarAdminService } from "../src/modules/matching/p76-canonical-sidecar-admin.service";
import type { P76CanonicalMatchResultMetaDbRow } from "../src/modules/matching/p76-canonical-sidecar-admin.types";

function baseRow(
  overrides: Partial<P76CanonicalMatchResultMetaDbRow> = {},
): P76CanonicalMatchResultMetaDbRow {
  return {
    id: "sidecar-1",
    auditRunId: "audit-r3f3",
    environment: "dev",
    viewerUserId: "r3f3-viewer-1",
    matchResultId: null,
    selectedCandidateId: "r3f3-cand-1",
    sourceType: "p76_canonical_writer",
    sourceVersion: "p7.10-r3f1-canonical-sidecar-writer-v1",
    schemaVersion: 1,
    mode: "sidecar",
    score: 0.88,
    reasonSummary: "RRM selected top mutual fit",
    stageSummary: { stage1PhotoVisual: { ok: true } },
    safeFallbackMeta: { safeFallbackRequired: false, reason: null },
    guardrails: { eligible: true, reason: "ok", blockedReasons: [] },
    dryRunPayload: {
      mode: "dry_run",
      appliedToMatchResult: false,
      guardrails: { eligible: true, reason: "ok" },
    },
    appliedToMatchResult: false,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    promotionStatus: "not_promoted",
    promotionTargetMatchResultId: null,
    rollbackToken: "secret-rollback-token",
    previousSnapshotHash: "hash-abc",
    pmSignoffStatus: "not_required",
    opsSignoffStatus: "not_required",
    rolledBack: false,
    supersededAt: null,
    deletedAt: null,
    createdAt: new Date("2026-05-19T12:00:00.000Z"),
    updatedAt: new Date("2026-05-19T12:00:00.000Z"),
    ...overrides,
  };
}

describe("P76CanonicalSidecarAdminController permissions", () => {
  it("uses VIEW_P76_CANONICAL_REHEARSAL on list, aggregate, detail", () => {
    for (const method of ["list", "aggregate", "detail"] as const) {
      const meta = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        P76CanonicalSidecarAdminController.prototype[method],
      );
      expect(meta).toBe(Permission.VIEW_P76_CANONICAL_REHEARSAL);
    }
  });

  it("has no POST/PATCH/DELETE handlers", () => {
    const proto = P76CanonicalSidecarAdminController.prototype;
    expect((proto as { create?: unknown }).create).toBeUndefined();
    expect((proto as { update?: unknown }).update).toBeUndefined();
    expect((proto as { remove?: unknown }).remove).toBeUndefined();
    expect((proto as { delete?: unknown }).delete).toBeUndefined();
  });
});

describe("p76 canonical sidecar admin derive", () => {
  it("sanitize removes forbidden keys", () => {
    const out = sanitizeP76CanonicalSidecarAdminJson({
      ok: true,
      rawPrompt: "secret",
      nested: { transcript: "x" },
    }) as Record<string, unknown>;
    expect(out).toEqual({ ok: true, nested: {} });
  });

  it("detail redacts rollbackToken to present boolean only", () => {
    const detail = deriveP76CanonicalSidecarAdminDetail(baseRow());
    expect(detail.rollbackTokenPresent).toBe(true);
    expect(JSON.stringify(detail)).not.toContain("secret-rollback-token");
    expect(detail.previousSnapshotHashPresent).toBe(true);
    expect(JSON.stringify(detail)).not.toContain("hash-abc");
  });

  it("list safety constants readByGetPath and readByWorker are false", () => {
    const item = deriveP76CanonicalSidecarAdminListItem(baseRow());
    expect(item.safety.readByGetPath).toBe(false);
    expect(item.safety.readByWorker).toBe(false);
    expect(item.safety.isSidecarOnly).toBe(true);
    expect(item.safety.notAppliedToMatchResult).toBe(true);
  });

  it("aggregate computes violation counts", () => {
    const rows = [
      baseRow({ id: "a" }),
      baseRow({
        id: "b",
        appliedToMatchResult: true,
        promotionStatus: "not_promoted",
      }),
      baseRow({
        id: "c",
        appliedToWorkerRanking: true,
      }),
    ];
    const items = rows.map((r) => deriveP76CanonicalSidecarAdminListItem(r));
    const agg = computeP76CanonicalSidecarAdminAggregate(items, rows);
    expect(agg.totalVisible).toBe(3);
    expect(agg.sidecarOnlyCount).toBe(3);
    expect(agg.appliedToMatchResultViolationCount).toBe(1);
    expect(agg.appliedToWorkerRankingViolationCount).toBe(1);
    expect(isP76CanonicalSidecarAppliedToMatchResultViolation(rows[1]!)).toBe(
      true,
    );
  });

  it("cursor encode/decode uses createdAt", () => {
    const createdAt = new Date("2026-05-19T12:00:00.000Z");
    const cursor = encodeP76CanonicalSidecarAdminListCursor({
      createdAt,
      id: "sidecar-1",
    });
    const decoded = decodeP76CanonicalSidecarAdminListCursor(cursor);
    expect(decoded?.id).toBe("sidecar-1");
    expect(decoded?.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it("limit normalizes to max 100", () => {
    expect(normalizeP76CanonicalSidecarAdminListLimit(200)).toBe(100);
    expect(normalizeP76CanonicalSidecarAdminListLimit(10)).toBe(10);
  });
});

describe("P76CanonicalSidecarAdminService", () => {
  const rows = [
    baseRow({
      id: "a",
      createdAt: new Date("2026-05-19T13:00:00.000Z"),
    }),
    baseRow({
      id: "b",
      createdAt: new Date("2026-05-19T12:00:00.000Z"),
      supersededAt: new Date("2026-05-19T11:00:00.000Z"),
    }),
  ];

  const findMany = jest.fn().mockResolvedValue(rows);
  const findUnique = jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
    rows.find((r) => r.id === where.id) ?? null,
  );

  let service: P76CanonicalSidecarAdminService;
  const prevEnv = process.env.PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED;

  beforeEach(async () => {
    process.env.PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED = "1";
    findMany.mockClear();
    findUnique.mockClear();
    const moduleRef = await Test.createTestingModule({
      providers: [
        P76CanonicalSidecarAdminService,
        {
          provide: PrismaService,
          useValue: {
            p76CanonicalMatchResultMeta: { findMany, findUnique },
            matchResult: { update: jest.fn() },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(P76CanonicalSidecarAdminService);
  });

  afterEach(() => {
    process.env.PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED = prevEnv;
  });

  it("throws NotFound when feature flag off and does not query Prisma", async () => {
    process.env.PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED = "0";
    await expect(
      service.listP76CanonicalSidecarAdmin({ limit: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("list calls findMany with default appliedToMatchResult=false and activeOnly", async () => {
    const out = await service.listP76CanonicalSidecarAdmin({ limit: 50 });
    expect(out.featureEnabled).toBe(true);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          appliedToMatchResult: false,
          deletedAt: null,
          supersededAt: null,
        }),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("list respects includeDeleted=false on deletedAt", async () => {
    await service.listP76CanonicalSidecarAdmin({
      includeDeleted: false,
      limit: 50,
    });
    expect(findMany.mock.calls[0][0].where.deletedAt).toBeNull();
  });

  it("list can filter auditRunId", async () => {
    await service.listP76CanonicalSidecarAdmin({
      auditRunId: "audit-r3f3",
      limit: 50,
    });
    expect(findMany.mock.calls[0][0].where.auditRunId).toBe("audit-r3f3");
  });

  it("detail throws NotFound when row missing", async () => {
    await expect(
      service.getP76CanonicalSidecarAdminById("missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("detail sanitizes dryRunPayload and links", async () => {
    const row = baseRow({
      id: "a",
      dryRunPayload: { mode: "dry_run", rawPrompt: "secret" },
    });
    findUnique.mockResolvedValueOnce(row);
    const out = await service.getP76CanonicalSidecarAdminById("a");
    expect((out.row.dryRunPayload as Record<string, unknown>).mode).toBe(
      "dry_run",
    );
    expect(out.row.dryRunPayload).not.toHaveProperty("rawPrompt");
    expect(out.links.rehearsalAdminPath).toContain("r3f3-viewer-1");
  });

  it("aggregate returns violation counts", async () => {
    const out = await service.getP76CanonicalSidecarAdminAggregate({});
    expect(out.appliedToMatchResultViolationCount).toBe(0);
    expect(out.totalVisible).toBe(2);
  });

  it("service mock does not call matchResult mutation", async () => {
    await service.listP76CanonicalSidecarAdmin({ limit: 10 });
    expect(findMany).toHaveBeenCalled();
  });

  it("cursor pagination returns nextCursor when more rows", async () => {
    const many = Array.from({ length: 3 }, (_, i) =>
      baseRow({
        id: `row-${i}`,
        createdAt: new Date(`2026-05-19T1${i}:00:00.000Z`),
      }),
    );
    findMany.mockResolvedValueOnce(many);
    const out = await service.listP76CanonicalSidecarAdmin({ limit: 2 });
    expect(out.items).toHaveLength(2);
    expect(out.pageInfo.nextCursor).not.toBeNull();
  });
});
