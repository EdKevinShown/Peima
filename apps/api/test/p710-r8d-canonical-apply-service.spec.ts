/**
 * P7.10-r8d — canonical Apply service (hard-disabled; mock Prisma only).
 */
import { applyP76CanonicalSidecarToMatchResult } from "../src/modules/matching/p76-canonical-apply.service";
import { readP76CanonicalApplyEnv } from "../src/modules/matching/p76-canonical-apply-env";
import type {
  P76CanonicalApplyEnvV1,
  P76CanonicalApplyGateContextV1,
  P76CanonicalApplyInputV1,
  P76CanonicalApplyMatchResultRow,
  P76CanonicalApplyPrisma,
  P76CanonicalApplySidecarRow,
  P76CanonicalApplySnapshotRow,
} from "../src/modules/matching/p76-canonical-apply.types";
import {
  P76_CANONICAL_APPLY_GATE12_PASS,
  P76_CANONICAL_APPLY_GRAFANA_PASS,
} from "../src/modules/matching/p76-canonical-apply.types";
import {
  computeP76BaselineFingerprintV1,
  summarizeP76MatchInsightsForRollbackSnapshot,
} from "../src/modules/matching/p76-canonical-apply-rollback-snapshot-builder";

const SIDECAR_ID = "sidecar-r8d";
const SNAPSHOT_ID = "snap-r8d";
const MR_ID = "mr-r8d";
const VIEWER = "viewer-r8d";
const CAND_BEFORE = "cand-before-r8d";
const CAND_AFTER = "cand-after-r8d";

function enabledApplyEnv(
  over: Partial<P76CanonicalApplyEnvV1> = {},
): P76CanonicalApplyEnvV1 {
  return {
    executionEnabled: true,
    allowDbWrite: true,
    configuredEnvironment: "dev",
    nodeEnv: "development",
    productionPercent: 0,
    percentEnabled: false,
    applyEnvironmentAllowed: true,
    productionBlocked: false,
    canExecute: true,
    ...over,
  };
}

function goodGateContext(
  over: Partial<P76CanonicalApplyGateContextV1> = {},
): P76CanonicalApplyGateContextV1 {
  return {
    gate12Status: P76_CANONICAL_APPLY_GATE12_PASS,
    grafanaStatus: P76_CANONICAL_APPLY_GRAFANA_PASS,
    pmSignoffStatus: "approved",
    opsSignoffStatus: "approved",
    engineeringSignoffStatus: "approved",
    incidentActive: false,
    workerDeployActive: false,
    percentRolloutActive: false,
    ...over,
  };
}

function goodSidecar(over: Partial<P76CanonicalApplySidecarRow> = {}): P76CanonicalApplySidecarRow {
  return {
    id: SIDECAR_ID,
    auditRunId: "audit-r8d",
    environment: "dev",
    viewerUserId: VIEWER,
    matchResultId: MR_ID,
    selectedCandidateId: CAND_AFTER,
    score: 0.91,
    reasonSummary: "canonical apply",
    sourceVersion: "p7.10-r8d-v1",
    promotionStatus: "not_promoted",
    appliedToMatchResult: false,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    rolledBack: false,
    deletedAt: null,
    supersededAt: null,
    pmSignoffStatus: "approved",
    opsSignoffStatus: "approved",
    ...over,
  };
}

function goodMatchResult(
  over: Partial<P76CanonicalApplyMatchResultRow> = {},
): P76CanonicalApplyMatchResultRow {
  return {
    id: MR_ID,
    userId: VIEWER,
    candidateUserId: CAND_BEFORE,
    finalScore: 0.7,
    reasonSummary: "baseline",
    matchInsights: { version: 1 },
    updatedAt: new Date("2026-05-19T12:00:00.000Z"),
    ...over,
  };
}

function goodSnapshot(
  mr: P76CanonicalApplyMatchResultRow,
  over: Partial<P76CanonicalApplySnapshotRow> = {},
): P76CanonicalApplySnapshotRow {
  const summary = summarizeP76MatchInsightsForRollbackSnapshot(mr.matchInsights);
  const baselineFingerprint = computeP76BaselineFingerprintV1({
    matchResultId: mr.id,
    viewerUserId: mr.userId,
    candidateUserId: mr.candidateUserId,
    finalScore: mr.finalScore,
    reasonSummary: mr.reasonSummary,
    matchInsightsSummary: summary,
    updatedAt: mr.updatedAt.toISOString(),
  });
  return {
    id: "snap-row-id",
    snapshotId: SNAPSHOT_ID,
    sidecarId: SIDECAR_ID,
    matchResultId: MR_ID,
    viewerUserId: VIEWER,
    beforeCandidateUserId: CAND_BEFORE,
    beforeFinalScore: 0.7,
    beforeReasonSummary: "baseline",
    beforeMatchInsightsChecksum: "abc",
    beforeMatchInsightsSummaryJson: summary,
    beforeUpdatedAt: mr.updatedAt,
    baselineFingerprint,
    proposedCandidateUserId: CAND_AFTER,
    proposedFinalScore: 0.91,
    proposedReasonSummary: "canonical apply",
    proposedSourceVersion: "p7.10-r8d-v1",
    rollbackTokenHash: "a".repeat(64),
    rolledBack: false,
    promotionStatus: "snapshot_created",
    applyAuditRunId: "audit-r8d",
    ...over,
  };
}

function baseInput(over: Partial<P76CanonicalApplyInputV1> = {}): P76CanonicalApplyInputV1 {
  return {
    sidecarId: SIDECAR_ID,
    snapshotId: SNAPSHOT_ID,
    requestedBy: "admin-r8d",
    environment: "dev",
    gateContext: goodGateContext(),
    now: "2026-05-19T19:00:00.000Z",
    ...over,
  };
}

function mockPrisma(opts: {
  sidecar?: P76CanonicalApplySidecarRow | null;
  snapshot?: P76CanonicalApplySnapshotRow | null;
  matchResult?: P76CanonicalApplyMatchResultRow | null;
}) {
  const sidecarUpdate = jest.fn().mockResolvedValue({});
  const snapshotUpdate = jest.fn().mockResolvedValue({});
  const matchResultUpdate = jest.fn().mockResolvedValue({});
  const sidecarFind = jest.fn().mockResolvedValue(opts.sidecar ?? null);
  const snapshotFind = jest.fn().mockResolvedValue(opts.snapshot ?? null);
  const matchResultFind = jest.fn().mockResolvedValue(opts.matchResult ?? null);
  const transaction = jest.fn(async (fn: (tx: P76CanonicalApplyPrisma) => Promise<unknown>) => {
    const tx = {
      p76CanonicalMatchResultMeta: {
        findUnique: sidecarFind,
        update: sidecarUpdate,
      },
      p76CanonicalApplyRollbackSnapshot: {
        findUnique: snapshotFind,
        update: snapshotUpdate,
      },
      matchResult: {
        findUnique: matchResultFind,
        update: matchResultUpdate,
      },
    };
    return fn(tx as unknown as P76CanonicalApplyPrisma);
  });

  const prisma = {
    $transaction: transaction,
    p76CanonicalMatchResultMeta: {
      findUnique: sidecarFind,
      update: sidecarUpdate,
    },
    p76CanonicalApplyRollbackSnapshot: {
      findUnique: snapshotFind,
      update: snapshotUpdate,
    },
    matchResult: {
      findUnique: matchResultFind,
      update: matchResultUpdate,
    },
  } as unknown as P76CanonicalApplyPrisma;

  return {
    prisma,
    transaction,
    sidecarFind,
    snapshotFind,
    matchResultFind,
    sidecarUpdate,
    snapshotUpdate,
    matchResultUpdate,
  };
}

describe("readP76CanonicalApplyEnv (P7.10-r8d)", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("defaults to hard-disabled", () => {
    delete process.env.PEIMA_P710_R8_APPLY_EXECUTION_ENABLED;
    delete process.env.PEIMA_P710_R8_APPLY_ALLOW_DB_WRITE;
    const env = readP76CanonicalApplyEnv();
    expect(env.executionEnabled).toBe(false);
    expect(env.allowDbWrite).toBe(false);
    expect(env.canExecute).toBe(false);
  });
});

describe("applyP76CanonicalSidecarToMatchResult (P7.10-r8d)", () => {
  it("1. default env blocks apply without prisma access", async () => {
    const { prisma, transaction, sidecarFind } = mockPrisma({});
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput(),
      { applyEnv: readP76CanonicalApplyEnv() },
    );
    expect(result.applied).toBe(false);
    expect(result.mode).toBe("blocked");
    expect(result.blockedReasons).toContain("apply_execution_disabled");
    expect(transaction).not.toHaveBeenCalled();
    expect(sidecarFind).not.toHaveBeenCalled();
  });

  it("2. EXECUTION_ENABLED=1 but ALLOW_DB_WRITE=0 blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput(),
      {
        applyEnv: enabledApplyEnv({ allowDbWrite: false, canExecute: false }),
      },
    );
    expect(result.blockedReasons).toContain("apply_db_write_disabled");
    expect(result.applied).toBe(false);
  });

  it("3. production environment blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput({ environment: "production" }),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("production_environment_blocked");
  });

  it("4. Gate 12 not final blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput({
        gateContext: goodGateContext({ gate12Status: "NEED_SIGNOFF" }),
      }),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("gate12_not_final");
  });

  it("5. Grafana not ready blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput({
        gateContext: goodGateContext({ grafanaStatus: "NEED_GRAFANA_IMPORT" }),
      }),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("grafana_not_ready");
  });

  it("6. PM/Ops/Eng missing blocks", async () => {
    const { prisma } = mockPrisma({});
    const rPm = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput({ gateContext: goodGateContext({ pmSignoffStatus: "pending" }) }),
      { applyEnv: enabledApplyEnv() },
    );
    expect(rPm.blockedReasons).toContain("pm_signoff_missing");
    const rOps = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput({ gateContext: goodGateContext({ opsSignoffStatus: "pending" }) }),
      { applyEnv: enabledApplyEnv() },
    );
    expect(rOps.blockedReasons).toContain("ops_signoff_missing");
    const rEng = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput({
        gateContext: goodGateContext({ engineeringSignoffStatus: "pending" }),
      }),
      { applyEnv: enabledApplyEnv() },
    );
    expect(rEng.blockedReasons).toContain("engineering_signoff_missing");
  });

  it("7. active incident blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput({ gateContext: goodGateContext({ incidentActive: true }) }),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("incident_active");
  });

  it("8. active worker deploy blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput({ gateContext: goodGateContext({ workerDeployActive: true }) }),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("worker_deploy_active");
  });

  it("9. percent>0 blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput({ gateContext: goodGateContext({ percentRolloutActive: true }) }),
      { applyEnv: enabledApplyEnv({ productionPercent: 1, percentEnabled: true }) },
    );
    expect(result.blockedReasons).toContain("percent_rollout_active");
  });

  it("10. sidecar missing blocks", async () => {
    const { prisma } = mockPrisma({ sidecar: null });
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput(),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("sidecar_not_found");
  });

  it("11. already promoted sidecar blocks", async () => {
    const mr = goodMatchResult();
    const { prisma } = mockPrisma({
      sidecar: goodSidecar({ promotionStatus: "promoted" }),
      snapshot: goodSnapshot(mr),
      matchResult: mr,
    });
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput(),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("already_promoted");
  });

  it("12. rolledBack sidecar blocks", async () => {
    const { prisma } = mockPrisma({ sidecar: goodSidecar({ rolledBack: true }) });
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput(),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("sidecar_rolled_back");
  });

  it("13. appliedToWorkerRanking=true blocks", async () => {
    const { prisma } = mockPrisma({
      sidecar: goodSidecar({ appliedToWorkerRanking: true }),
    });
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput(),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("sidecar_applied_to_worker_ranking");
  });

  it("14. MatchResult missing blocks", async () => {
    const mr = goodMatchResult();
    const { prisma } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(mr),
      matchResult: null,
    });
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput(),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("match_result_not_found");
  });

  it("15. snapshot missing blocks", async () => {
    const { prisma } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: null,
    });
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput(),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("snapshot_not_found");
  });

  it("16. snapshot mismatch blocks", async () => {
    const mr = goodMatchResult();
    const { prisma } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(mr, { sidecarId: "other-sidecar" }),
      matchResult: mr,
    });
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput(),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("snapshot_mismatch");
  });

  it("17. baselineFingerprint mismatch blocks", async () => {
    const mr = goodMatchResult();
    const { prisma } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(mr, { baselineFingerprint: "deadbeef".repeat(8) }),
      matchResult: mr,
    });
    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput(),
      { applyEnv: enabledApplyEnv() },
    );
    expect(result.blockedReasons).toContain("baseline_fingerprint_mismatch");
  });

  it("18. disabled path does not call update / transaction", async () => {
    const mr = goodMatchResult();
    const { prisma, transaction, matchResultUpdate } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(mr),
      matchResult: mr,
    });
    await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput(),
      { applyEnv: readP76CanonicalApplyEnv() },
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(matchResultUpdate).not.toHaveBeenCalled();
  });

  it("19–24. enabled all-pass mock path applies updates", async () => {
    const mr = goodMatchResult();
    const {
      prisma,
      transaction,
      matchResultUpdate,
      sidecarUpdate,
      snapshotUpdate,
    } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(mr),
      matchResult: mr,
    });

    const result = await applyP76CanonicalSidecarToMatchResult(
      { prisma },
      baseInput(),
      { applyEnv: enabledApplyEnv() },
    );

    expect(result.applied).toBe(true);
    expect(result.mode).toBe("applied");
    expect(result.blockedReasons).toHaveLength(0);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(matchResultUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MR_ID },
        data: expect.objectContaining({ candidateUserId: CAND_AFTER }),
      }),
    );
    expect(sidecarUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          promotionStatus: "promoted",
          appliedToMatchResult: true,
          appliedToFinalScore: true,
          appliedToWorkerRanking: false,
        }),
      }),
    );
    expect(snapshotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          promotionStatus: "applied",
          appliedBy: "admin-r8d",
        }),
      }),
    );
    expect(result.safety.triggersWorker).toBe(false);
    expect(result.safety.changesPercent).toBe(false);
    expect(result.safety.productionRollout).toBe(false);
    expect(result.after?.candidateUserId).toBe(CAND_AFTER);
  });
});
