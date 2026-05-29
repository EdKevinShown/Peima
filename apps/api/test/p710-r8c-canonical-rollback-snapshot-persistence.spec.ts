/**
 * P7.10-r8c — rollback snapshot persistence (mock Prisma; snapshot table only).
 */
import { buildP76CanonicalApplyPreviewPayloadV1 } from "../src/modules/matching/p76-canonical-apply-preview-builder";
import type { P76CanonicalApplyPreviewInputV1 } from "../src/modules/matching/p76-canonical-apply-preview.types";
import { buildP76CanonicalApplyRollbackSnapshotV1 } from "../src/modules/matching/p76-canonical-apply-rollback-snapshot-builder";
import type { P76CanonicalApplyRollbackSnapshotBuildInputV1 } from "../src/modules/matching/p76-canonical-apply-rollback-snapshot.types";
import {
  assertP76CanonicalApplyRollbackSnapshotPersistencePrismaSurfaceSafe,
  createP76CanonicalApplyRollbackSnapshotRecord,
} from "../src/modules/matching/p76-canonical-apply-rollback-snapshot-persistence.service";
import type {
  P76CanonicalApplyRollbackSnapshotPersistencePrisma,
  P76CanonicalApplyRollbackSnapshotPersistedRow,
} from "../src/modules/matching/p76-canonical-apply-rollback-snapshot-persistence.types";
import { P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_PERSISTENCE_SOURCE_VERSION } from "../src/modules/matching/p76-canonical-apply-rollback-snapshot-persistence.types";

const VIEWER = "viewer-p710-r8c";
const MR_ID = "mr-p710-r8c";
const SIDECAR_ID = "sidecar-p710-r8c";
const CAND_OLD = "cand-old-p710-r8c";
const CAND_NEW = "cand-new-p710-r8c";
const SNAPSHOT_ID = "snap-p710-r8c-001";
const CAPTURED_AT = "2026-05-19T16:00:00.000Z";

function previewInput(): P76CanonicalApplyPreviewInputV1 {
  return {
    sidecar: {
      id: SIDECAR_ID,
      auditRunId: "audit-r8c",
      environment: "dev",
      viewerUserId: VIEWER,
      matchResultId: MR_ID,
      selectedCandidateId: CAND_NEW,
      score: 0.85,
      reasonSummary: "canonical proposal",
      sourceVersion: "p7.6-cohort-v1",
      promotionStatus: "not_promoted",
      appliedToMatchResult: false,
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
      rolledBack: false,
      deletedAt: null,
      supersededAt: null,
      pmSignoffStatus: "approved",
      opsSignoffStatus: "approved",
    },
    currentMatchResult: {
      id: MR_ID,
      viewerUserId: VIEWER,
      candidateUserId: CAND_OLD,
      finalScore: 0.7,
      reasonSummary: "worker baseline",
      matchInsights: {
        version: 1,
        p76CanonicalWriterMeta: { source: "worker" },
        rawPrompt: "must-not-appear-in-summary",
      },
    },
    context: {
      gate12Status: "PASS",
      grafanaStatus: "PASS",
      pmSignoffRequired: true,
      opsSignoffRequired: true,
      productionWriteRequested: false,
      incidentActive: false,
      percentRolloutActive: false,
      workerDeployActive: false,
    },
    previewedAt: CAPTURED_AT,
  };
}

function goodSnapshotInput(
  over: Partial<P76CanonicalApplyRollbackSnapshotBuildInputV1> = {},
): P76CanonicalApplyRollbackSnapshotBuildInputV1 {
  const preview = buildP76CanonicalApplyPreviewPayloadV1(previewInput());
  return {
    sidecar: previewInput().sidecar!,
    currentMatchResult: previewInput().currentMatchResult!,
    previewPayload: preview,
    now: CAPTURED_AT,
    rollbackTtlHours: 72,
    environment: "dev",
    snapshotId: SNAPSHOT_ID,
    capturedBy: "admin-r8c",
    approvals: { engineeringSignoffStatus: "approved" },
    ...over,
  };
}

function readySnapshot(over: Partial<P76CanonicalApplyRollbackSnapshotBuildInputV1> = {}) {
  return buildP76CanonicalApplyRollbackSnapshotV1(goodSnapshotInput(over));
}

function mockPersistedRow(
  data: Record<string, unknown>,
): P76CanonicalApplyRollbackSnapshotPersistedRow {
  const now = new Date(CAPTURED_AT);
  return {
    id: "row-cuid-r8c",
    snapshotId: String(data.snapshotId),
    sidecarId: String(data.sidecarId),
    matchResultId: String(data.matchResultId),
    viewerUserId: String(data.viewerUserId),
    beforeCandidateUserId: String(data.beforeCandidateUserId),
    beforeFinalScore: Number(data.beforeFinalScore),
    beforeReasonSummary: (data.beforeReasonSummary as string | null) ?? null,
    beforeMatchInsightsChecksum:
      (data.beforeMatchInsightsChecksum as string | null) ?? null,
    beforeMatchInsightsSummaryJson:
      (data.beforeMatchInsightsSummaryJson as object | null) ?? null,
    beforeUpdatedAt: (data.beforeUpdatedAt as Date | null) ?? null,
    baselineFingerprint: String(data.baselineFingerprint),
    proposedCandidateUserId: String(data.proposedCandidateUserId),
    proposedFinalScore: Number(data.proposedFinalScore),
    proposedReasonSummary: (data.proposedReasonSummary as string | null) ?? null,
    proposedSourceVersion: (data.proposedSourceVersion as string | null) ?? null,
    rollbackTokenHash: (data.rollbackTokenHash as string | null) ?? null,
    rollbackExpiresAt: (data.rollbackExpiresAt as Date | null) ?? null,
    rollbackUsedAt: null,
    rolledBack: false,
    rolledBackAt: null,
    rollbackReason: null,
    applyAuditRunId: (data.applyAuditRunId as string | null) ?? null,
    appliedBy: (data.appliedBy as string | null) ?? null,
    approvedByPm: (data.approvedByPm as string | null) ?? null,
    approvedByOps: (data.approvedByOps as string | null) ?? null,
    approvedByEngineering: (data.approvedByEngineering as string | null) ?? null,
    promotionStatus: "snapshot_created",
    sourceType: String(data.sourceType),
    sourceVersion: String(data.sourceVersion),
    environment: String(data.environment),
    createdAt: now,
    updatedAt: now,
  };
}

function mockPrisma() {
  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
    mockPersistedRow(data),
  );
  const matchResultUpdate = jest.fn();
  const sidecarUpdate = jest.fn();
  const prisma = {
    p76CanonicalApplyRollbackSnapshot: { create },
    matchResult: { update: matchResultUpdate },
    p76CanonicalMatchResultMeta: { update: sidecarUpdate },
  } as unknown as P76CanonicalApplyRollbackSnapshotPersistencePrisma & {
    matchResult: { update: jest.Mock };
    p76CanonicalMatchResultMeta: { update: jest.Mock };
  };
  return { prisma, create, matchResultUpdate, sidecarUpdate };
}

describe("createP76CanonicalApplyRollbackSnapshotRecord (P7.10-r8c)", () => {
  it("creates snapshot row when snapshotReady=true", async () => {
    const { prisma, create } = mockPrisma();
    const dryRunSnapshot = readySnapshot();
    expect(dryRunSnapshot.snapshotReady).toBe(true);

    const result = await createP76CanonicalApplyRollbackSnapshotRecord(
      { prisma },
      { dryRunSnapshot, auditRunId: "audit-r8c", requestedBy: "admin-r8c" },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persisted.snapshotId).toBe(SNAPSHOT_ID);
    expect(result.persisted.baselineFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.persisted.beforeCandidateUserId).toBe(CAND_OLD);
    expect(result.persisted.beforeFinalScore).toBe(0.7);
    expect(result.persisted.proposedCandidateUserId).toBe(CAND_NEW);
    expect(result.persisted.proposedFinalScore).toBe(0.85);
    expect(result.persisted.rolledBack).toBe(false);
    expect(result.persisted.promotionStatus).toBe("snapshot_created");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("skips create when snapshotReady=false", async () => {
    const { prisma, create } = mockPrisma();
    const dryRunSnapshot = readySnapshot({ sidecar: null });
    expect(dryRunSnapshot.snapshotReady).toBe(false);

    const result = await createP76CanonicalApplyRollbackSnapshotRecord(
      { prisma },
      { dryRunSnapshot },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("snapshot_not_ready");
    expect(create).not.toHaveBeenCalled();
  });

  it("stores matchInsights summary/checksum only (no rawPrompt in persisted json)", async () => {
    const { prisma, create } = mockPrisma();
    const dryRunSnapshot = readySnapshot();
    await createP76CanonicalApplyRollbackSnapshotRecord({ prisma }, { dryRunSnapshot });

    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    const summary = data.beforeMatchInsightsSummaryJson as Record<string, unknown>;
    expect(summary).toBeDefined();
    expect(summary).not.toHaveProperty("rawPrompt");
    expect(summary.forbiddenKeysStripped).toContain("rawPrompt");
    expect(data.beforeMatchInsightsChecksum).toEqual(expect.any(String));
  });

  it("allows null rollbackTokenHash and never stores plaintext token", async () => {
    const { prisma, create } = mockPrisma();
    const dryRunSnapshot = readySnapshot();
    await createP76CanonicalApplyRollbackSnapshotRecord(
      { prisma },
      { dryRunSnapshot, rollbackTokenHash: null },
    );

    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.rollbackTokenHash).toBeNull();
    expect(JSON.stringify(data)).not.toMatch(/rollbackToken(?!Hash)/);
  });

  it("accepts caller-provided rollbackTokenHash only (hashed)", async () => {
    const { prisma, create } = mockPrisma();
    const hash = "a".repeat(64);
    const dryRunSnapshot = readySnapshot();
    await createP76CanonicalApplyRollbackSnapshotRecord(
      { prisma },
      { dryRunSnapshot, rollbackTokenHash: hash },
    );

    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.rollbackTokenHash).toBe(hash);
  });

  it("uses r8c persistence sourceVersion on row", async () => {
    const { prisma, create } = mockPrisma();
    await createP76CanonicalApplyRollbackSnapshotRecord(
      { prisma },
      { dryRunSnapshot: readySnapshot() },
    );
    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.sourceVersion).toBe(
      P76_CANONICAL_APPLY_ROLLBACK_SNAPSHOT_PERSISTENCE_SOURCE_VERSION,
    );
  });

  it("does not mutate MatchResult or sidecar", async () => {
    const { prisma, matchResultUpdate, sidecarUpdate } = mockPrisma();
    await createP76CanonicalApplyRollbackSnapshotRecord(
      { prisma },
      { dryRunSnapshot: readySnapshot() },
    );
    expect(matchResultUpdate).not.toHaveBeenCalled();
    expect(sidecarUpdate).not.toHaveBeenCalled();
  });

  it("rejects dry-run snapshot carrying rollbackTokenHash on payload", async () => {
    const { prisma, create } = mockPrisma();
    const dryRunSnapshot = readySnapshot();
    const tampered = {
      ...dryRunSnapshot,
      rollback: { ...dryRunSnapshot.rollback, rollbackTokenHash: "deadbeef" as unknown as null },
    };
    const result = await createP76CanonicalApplyRollbackSnapshotRecord(
      { prisma },
      { dryRunSnapshot: tampered },
    );
    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("migration.sql (P7.10-r8c)", () => {
  it("creates only p76_canonical_apply_rollback_snapshot (additive)", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        "../../../packages/database/prisma/migrations/20260520100000_p76_canonical_apply_rollback_snapshot/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/CREATE TABLE "p76_canonical_apply_rollback_snapshot"/);
    expect(sql).not.toMatch(/ALTER TABLE "MatchResult"/i);
    expect(sql).not.toMatch(/DROP /i);
    expect(sql).not.toMatch(/CREATE TRIGGER/i);
    expect(sql).toMatch(/snapshotId/);
    expect(sql).toMatch(/baselineFingerprint/);
  });
});

describe("assertP76CanonicalApplyRollbackSnapshotPersistencePrismaSurfaceSafe", () => {
  it("allows snapshot-only prisma mock", () => {
    expect(() =>
      assertP76CanonicalApplyRollbackSnapshotPersistencePrismaSurfaceSafe({
        p76CanonicalApplyRollbackSnapshot: { create: async () => ({}) },
      }),
    ).not.toThrow();
  });

  it("rejects prisma with matchResult.update", () => {
    expect(() =>
      assertP76CanonicalApplyRollbackSnapshotPersistencePrismaSurfaceSafe({
        p76CanonicalApplyRollbackSnapshot: { create: async () => ({}) },
        matchResult: { update: async () => ({}) },
      }),
    ).toThrow(/matchResult\.update/);
  });
});
