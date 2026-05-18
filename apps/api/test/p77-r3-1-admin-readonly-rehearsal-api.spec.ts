/**
 * P7.7-r3.1 — canonical rehearsal admin read API (service unit tests).
 */
import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import {
  computeP76RehearsalAdminAggregate,
  deriveP76RehearsalAdminStatuses,
  sanitizeP76RehearsalAdminJson,
  toP76RehearsalAdminListItem,
} from "../src/modules/matching/p76-canonical-rehearsal-admin.derive";
import { P76CanonicalRehearsalAdminService } from "../src/modules/matching/p76-canonical-rehearsal-admin.service";
import type { P76CanonicalRehearsalMetaDbRow } from "../src/modules/matching/p76-canonical-rehearsal-admin.types";

function baseRow(
  overrides: Partial<P76CanonicalRehearsalMetaDbRow> = {},
): P76CanonicalRehearsalMetaDbRow {
  return {
    id: "reh-1",
    viewerUserId: "viewer-1",
    matchResultId: "match-1",
    baselineCandidateUserId: "base-1",
    proposedCandidateUserId: "prop-1",
    baselineFinalScore: 0.8,
    proposedScore: 0.82,
    scoreVersion: "p76-canonical-shadow-score-v1",
    wouldChangeCandidate: true,
    eligible: true,
    guardrailReason: "ok",
    scoreDeltaBand: "small",
    sourceType: "p76_canonical_writer_shadow",
    sourceVersion: "p7.10-r6-p76-canonical-writer-shadow-v1",
    pipelineVersion: "p76-canonical-shadow-v1",
    readPathSourceVersion: "p7.6-r7j3-staging-cohort-v1",
    allowlistApplyMetaId: "meta-1",
    auditRunId: "audit-r6f3",
    rehearsalMode: "sidecar_rehearsal",
    environment: "dev",
    appliedToMatchResult: false,
    shadowPayload: {
      mode: "shadow",
      appliedToMatchResult: false,
      guardrails: { eligible: true, reason: "ok" },
    },
    summary: { runner: "p710-r6f3" },
    generatedAt: new Date("2026-05-18T12:00:00.000Z"),
    expiresAt: null,
    supersededAt: null,
    deletedAt: null,
    createdAt: new Date("2026-05-18T12:00:00.000Z"),
    updatedAt: new Date("2026-05-18T12:00:00.000Z"),
    ...overrides,
  };
}

describe("p76 canonical rehearsal admin derive", () => {
  it("derive marks shadow_only / not_applied", () => {
    const d = deriveP76RehearsalAdminStatuses(baseRow());
    expect(d.rehearsalStatus).toBe("shadow_only");
    expect(d.productApplyStatus).toBe("not_applied");
    expect(d.violationStatus).toBe("ok");
  });

  it("derive flags p0 when appliedToMatchResult true", () => {
    const d = deriveP76RehearsalAdminStatuses(
      baseRow({ appliedToMatchResult: true }),
    );
    expect(d.violationStatus).toBe("p0_applied_to_match_result");
  });

  it("sanitize removes forbidden keys from shadow", () => {
    const out = sanitizeP76RehearsalAdminJson({
      ok: true,
      rawPrompt: "secret",
      nested: { imageUrl: "http://x" },
    }) as Record<string, unknown>;
    expect(out).toEqual({ ok: true, nested: {} });
  });

  it("aggregate counts eligible and violations", () => {
    const items = [
      toP76RehearsalAdminListItem(baseRow({ id: "a" })),
      toP76RehearsalAdminListItem(
        baseRow({ id: "b", eligible: false, guardrailReason: "rolled_back" }),
      ),
    ];
    const agg = computeP76RehearsalAdminAggregate(items);
    expect(agg.totalVisible).toBe(2);
    expect(agg.eligibleCount).toBe(1);
    expect(agg.blockedCount).toBe(1);
    expect(agg.reasonCounts.ok).toBe(1);
    expect(agg.reasonCounts.rolled_back).toBe(1);
  });
});

describe("P76CanonicalRehearsalAdminService", () => {
  const rows = [
    baseRow({ id: "a", generatedAt: new Date("2026-05-18T13:00:00.000Z") }),
    baseRow({
      id: "b",
      generatedAt: new Date("2026-05-18T12:00:00.000Z"),
      auditRunId: "audit-other",
      eligible: false,
      guardrailReason: "rolled_back",
    }),
  ];

  const findMany = jest.fn().mockResolvedValue(rows);
  const findUnique = jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
    rows.find((r) => r.id === where.id) ?? null,
  );

  let service: P76CanonicalRehearsalAdminService;
  const prevEnv = process.env.PEIMA_P76_REHEARSAL_ADMIN_ENABLED;

  beforeEach(async () => {
    process.env.PEIMA_P76_REHEARSAL_ADMIN_ENABLED = "1";
    findMany.mockClear();
    findUnique.mockClear();
    const moduleRef = await Test.createTestingModule({
      providers: [
        P76CanonicalRehearsalAdminService,
        {
          provide: PrismaService,
          useValue: {
            p76CanonicalWriterRehearsalMeta: { findMany, findUnique },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(P76CanonicalRehearsalAdminService);
  });

  afterEach(() => {
    process.env.PEIMA_P76_REHEARSAL_ADMIN_ENABLED = prevEnv;
  });

  it("throws NotFound when feature flag off", async () => {
    process.env.PEIMA_P76_REHEARSAL_ADMIN_ENABLED = "0";
    await expect(
      service.listP76CanonicalRehearsalAdmin({ limit: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("list returns items with default appliedToMatchResult=false filter", async () => {
    const out = await service.listP76CanonicalRehearsalAdmin({ limit: 50 });
    expect(out.featureEnabled).toBe(true);
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.aggregate.totalVisible).toBe(2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          appliedToMatchResult: false,
          deletedAt: null,
          supersededAt: null,
        }),
      }),
    );
  });

  it("list filters by auditRunId", async () => {
    await service.listP76CanonicalRehearsalAdmin({
      auditRunId: "audit-r6f3",
      limit: 50,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ auditRunId: "audit-r6f3" }),
      }),
    );
  });

  it("detail returns sanitized shadow and links", async () => {
    const out = await service.getP76CanonicalRehearsalAdminById("a");
    expect(out.row.id).toBe("a");
    expect(out.derived.rehearsalStatus).toBe("shadow_only");
    expect(out.links.allowlistApplyMetaAdminPath).toBe(
      "/admin/p76/allowlist-apply-meta/meta-1",
    );
    expect((out.shadow as Record<string, unknown>).mode).toBe("shadow");
  });

  it("detail throws when row missing", async () => {
    await expect(
      service.getP76CanonicalRehearsalAdminById("missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("aggregate endpoint returns counts", async () => {
    const out = await service.getP76CanonicalRehearsalAdminAggregate({});
    expect(out.featureEnabled).toBe(true);
    expect(out.totalVisible).toBe(2);
    expect(out.appliedToMatchResultViolationCount).toBe(0);
  });
});
