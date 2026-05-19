/**
 * P7.10-r8e — canonical Rollback service (hard-disabled; token-gated; mock Prisma only).
 */
import {
  deriveP76CanonicalRollbackTokenHashForTests,
  rollbackP76CanonicalApply,
} from "../src/modules/matching/p76-canonical-rollback.service";
import { readP76CanonicalRollbackEnv } from "../src/modules/matching/p76-canonical-rollback-env";
import {
  hashP76CanonicalRollbackTokenV1,
  verifyP76CanonicalRollbackTokenV1,
} from "../src/modules/matching/p76-canonical-rollback-token";
import type {
  P76CanonicalRollbackEnvV1,
  P76CanonicalRollbackGateContextV1,
  P76CanonicalRollbackInputV1,
  P76CanonicalRollbackMatchResultRow,
  P76CanonicalRollbackPrisma,
  P76CanonicalRollbackSidecarRow,
  P76CanonicalRollbackSnapshotRow,
} from "../src/modules/matching/p76-canonical-rollback.types";
import {
  P76_CANONICAL_ROLLBACK_GATE12_PASS,
  P76_CANONICAL_ROLLBACK_GRAFANA_PASS,
} from "../src/modules/matching/p76-canonical-rollback.types";

const PEPPER = "test-pepper-r8e";
const FAKE_TOKEN = "fake-rollback-token-r8e-only-for-tests";
const SIDECAR_ID = "sidecar-r8e";
const SNAPSHOT_ID = "snap-r8e";
const MR_ID = "mr-r8e";
const VIEWER = "viewer-r8e";
const CAND_BEFORE = "cand-before-r8e";
const CAND_AFTER = "cand-after-r8e";

const BINDING = {
  snapshotId: SNAPSHOT_ID,
  matchResultId: MR_ID,
  sidecarId: SIDECAR_ID,
};

function tokenHash(): string {
  return deriveP76CanonicalRollbackTokenHashForTests(FAKE_TOKEN, BINDING, PEPPER);
}

function enabledRollbackEnv(
  over: Partial<P76CanonicalRollbackEnvV1> = {},
): P76CanonicalRollbackEnvV1 {
  return {
    executionEnabled: true,
    allowDbWrite: true,
    requireToken: true,
    configuredEnvironment: "dev",
    nodeEnv: "development",
    productionPercent: 0,
    percentEnabled: false,
    rollbackEnvironmentAllowed: true,
    productionBlocked: false,
    canExecute: true,
    ...over,
  };
}

function goodGateContext(
  over: Partial<P76CanonicalRollbackGateContextV1> = {},
): P76CanonicalRollbackGateContextV1 {
  return {
    gate12Status: P76_CANONICAL_ROLLBACK_GATE12_PASS,
    grafanaStatus: P76_CANONICAL_ROLLBACK_GRAFANA_PASS,
    pmSignoffStatus: "approved",
    opsSignoffStatus: "approved",
    engineeringSignoffStatus: "approved",
    incidentActive: false,
    workerDeployActive: false,
    percentRolloutActive: false,
    ...over,
  };
}

function goodSidecar(
  over: Partial<P76CanonicalRollbackSidecarRow> = {},
): P76CanonicalRollbackSidecarRow {
  return {
    id: SIDECAR_ID,
    auditRunId: "audit-r8e",
    environment: "dev",
    viewerUserId: VIEWER,
    matchResultId: MR_ID,
    selectedCandidateId: CAND_AFTER,
    score: 0.91,
    reasonSummary: "canonical apply",
    promotionStatus: "promoted",
    appliedToMatchResult: true,
    appliedToFinalScore: true,
    appliedToWorkerRanking: false,
    rolledBack: false,
    rolledBackAt: null,
    rolledBackBy: null,
    deletedAt: null,
    supersededAt: null,
    ...over,
  };
}

function goodMatchResultApplied(
  over: Partial<P76CanonicalRollbackMatchResultRow> = {},
): P76CanonicalRollbackMatchResultRow {
  return {
    id: MR_ID,
    userId: VIEWER,
    candidateUserId: CAND_AFTER,
    finalScore: 0.91,
    reasonSummary: "canonical apply",
    matchInsights: { version: 1, applied: true },
    updatedAt: new Date("2026-05-19T18:00:00.000Z"),
    ...over,
  };
}

function goodSnapshot(
  over: Partial<P76CanonicalRollbackSnapshotRow> = {},
): P76CanonicalRollbackSnapshotRow {
  return {
    id: "snap-row-id-r8e",
    snapshotId: SNAPSHOT_ID,
    sidecarId: SIDECAR_ID,
    matchResultId: MR_ID,
    viewerUserId: VIEWER,
    beforeCandidateUserId: CAND_BEFORE,
    beforeFinalScore: 0.7,
    beforeReasonSummary: "baseline",
    beforeMatchInsightsSummaryJson: { version: 1 },
    baselineFingerprint: "fp-r8e",
    proposedCandidateUserId: CAND_AFTER,
    proposedFinalScore: 0.91,
    proposedReasonSummary: "canonical apply",
    rollbackTokenHash: tokenHash(),
    rollbackExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    rollbackUsedAt: null,
    rolledBack: false,
    promotionStatus: "applied",
    applyAuditRunId: "audit-r8e",
    ...over,
  };
}

function baseInput(over: Partial<P76CanonicalRollbackInputV1> = {}): P76CanonicalRollbackInputV1 {
  return {
    snapshotId: SNAPSHOT_ID,
    sidecarId: SIDECAR_ID,
    matchResultId: MR_ID,
    rollbackTokenPlaintext: FAKE_TOKEN,
    requestedBy: "admin-r8e",
    environment: "dev",
    gateContext: goodGateContext(),
    now: "2026-05-19T20:00:00.000Z",
    ...over,
  };
}

function mockPrisma(opts: {
  sidecar?: P76CanonicalRollbackSidecarRow | null;
  snapshot?: P76CanonicalRollbackSnapshotRow | null;
  matchResult?: P76CanonicalRollbackMatchResultRow | null;
}) {
  const sidecarUpdate = jest.fn().mockResolvedValue({});
  const snapshotUpdate = jest.fn().mockResolvedValue({});
  const matchResultUpdate = jest.fn().mockResolvedValue({});
  const sidecarFind = jest.fn().mockResolvedValue(opts.sidecar ?? null);
  const snapshotFind = jest.fn().mockResolvedValue(opts.snapshot ?? null);
  const matchResultFind = jest.fn().mockResolvedValue(opts.matchResult ?? null);
  const transaction = jest.fn(async (fn: (tx: P76CanonicalRollbackPrisma) => Promise<unknown>) => {
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
    return fn(tx as unknown as P76CanonicalRollbackPrisma);
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
  } as unknown as P76CanonicalRollbackPrisma;

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

describe("p76-canonical-rollback-token (P7.10-r8e)", () => {
  it("hashes and verifies bound token with pepper", () => {
    const hash = hashP76CanonicalRollbackTokenV1(FAKE_TOKEN, BINDING, PEPPER);
    expect(hash).toHaveLength(64);
    expect(verifyP76CanonicalRollbackTokenV1(FAKE_TOKEN, hash, BINDING, PEPPER)).toBe(true);
    expect(verifyP76CanonicalRollbackTokenV1("wrong", hash, BINDING, PEPPER)).toBe(false);
  });
});

describe("readP76CanonicalRollbackEnv (P7.10-r8e)", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("defaults to hard-disabled with token required", () => {
    delete process.env.PEIMA_P710_R8_ROLLBACK_EXECUTION_ENABLED;
    delete process.env.PEIMA_P710_R8_ROLLBACK_ALLOW_DB_WRITE;
    const env = readP76CanonicalRollbackEnv();
    expect(env.executionEnabled).toBe(false);
    expect(env.allowDbWrite).toBe(false);
    expect(env.requireToken).toBe(true);
    expect(env.canExecute).toBe(false);
  });
});

describe("rollbackP76CanonicalApply (P7.10-r8e)", () => {
  it("1. default env blocks rollback without prisma access", async () => {
    const { prisma, transaction, snapshotFind } = mockPrisma({});
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: readP76CanonicalRollbackEnv(),
    });
    expect(result.rolledBack).toBe(false);
    expect(result.mode).toBe("blocked");
    expect(result.blockedReasons).toContain("rollback_execution_disabled");
    expect(transaction).not.toHaveBeenCalled();
    expect(snapshotFind).not.toHaveBeenCalled();
  });

  it("2. EXECUTION_ENABLED=1 but ALLOW_DB_WRITE=0 blocks", async () => {
    const { prisma, transaction } = mockPrisma({});
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv({ allowDbWrite: false, canExecute: false }),
    });
    expect(result.blockedReasons).toContain("rollback_db_write_disabled");
    expect(result.rolledBack).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("3. REQUIRE_TOKEN=1 but token missing blocks", async () => {
    const { prisma, transaction } = mockPrisma({});
    const result = await rollbackP76CanonicalApply(
      { prisma },
      baseInput({ rollbackTokenPlaintext: null }),
      { rollbackEnv: enabledRollbackEnv() },
    );
    expect(result.blockedReasons).toContain("rollback_token_missing");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("4. token hash missing blocks", async () => {
    const mr = goodMatchResultApplied();
    const { prisma } = mockPrisma({
      snapshot: goodSnapshot({ rollbackTokenHash: null }),
      sidecar: goodSidecar(),
      matchResult: mr,
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.blockedReasons).toContain("rollback_token_hash_missing");
    expect(result.rolledBack).toBe(false);
  });

  it("5. invalid token blocks", async () => {
    const mr = goodMatchResultApplied();
    const { prisma } = mockPrisma({
      snapshot: goodSnapshot(),
      sidecar: goodSidecar(),
      matchResult: mr,
    });
    const result = await rollbackP76CanonicalApply(
      { prisma },
      baseInput({ rollbackTokenPlaintext: "wrong-token" }),
      { rollbackEnv: enabledRollbackEnv(), tokenPepper: PEPPER },
    );
    expect(result.blockedReasons).toContain("rollback_token_invalid");
  });

  it("6. production environment blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await rollbackP76CanonicalApply(
      { prisma },
      baseInput({ environment: "production" }),
      { rollbackEnv: enabledRollbackEnv() },
    );
    expect(result.blockedReasons).toContain("production_environment_blocked");
  });

  it("7. Gate 12 not final blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await rollbackP76CanonicalApply(
      { prisma },
      baseInput({ gateContext: goodGateContext({ gate12Status: "NEED_SIGNOFF" }) }),
      { rollbackEnv: enabledRollbackEnv() },
    );
    expect(result.blockedReasons).toContain("gate12_not_final");
  });

  it("8. Grafana not ready blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await rollbackP76CanonicalApply(
      { prisma },
      baseInput({
        gateContext: goodGateContext({ grafanaStatus: "NEED_GRAFANA_IMPORT" }),
      }),
      { rollbackEnv: enabledRollbackEnv() },
    );
    expect(result.blockedReasons).toContain("grafana_not_ready");
  });

  it("9. signoff missing blocks", async () => {
    const { prisma } = mockPrisma({});
    const rPm = await rollbackP76CanonicalApply(
      { prisma },
      baseInput({ gateContext: goodGateContext({ pmSignoffStatus: "pending" }) }),
      { rollbackEnv: enabledRollbackEnv() },
    );
    expect(rPm.blockedReasons).toContain("pm_signoff_missing");
    const rOps = await rollbackP76CanonicalApply(
      { prisma },
      baseInput({ gateContext: goodGateContext({ opsSignoffStatus: "pending" }) }),
      { rollbackEnv: enabledRollbackEnv() },
    );
    expect(rOps.blockedReasons).toContain("ops_signoff_missing");
    const rEng = await rollbackP76CanonicalApply(
      { prisma },
      baseInput({
        gateContext: goodGateContext({ engineeringSignoffStatus: "pending" }),
      }),
      { rollbackEnv: enabledRollbackEnv() },
    );
    expect(rEng.blockedReasons).toContain("eng_signoff_missing");
  });

  it("10. active incident blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await rollbackP76CanonicalApply(
      { prisma },
      baseInput({ gateContext: goodGateContext({ incidentActive: true }) }),
      { rollbackEnv: enabledRollbackEnv() },
    );
    expect(result.blockedReasons).toContain("incident_active");
  });

  it("11. active worker deploy blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await rollbackP76CanonicalApply(
      { prisma },
      baseInput({ gateContext: goodGateContext({ workerDeployActive: true }) }),
      { rollbackEnv: enabledRollbackEnv() },
    );
    expect(result.blockedReasons).toContain("worker_deploy_active");
  });

  it("12. percent active blocks", async () => {
    const { prisma } = mockPrisma({});
    const result = await rollbackP76CanonicalApply(
      { prisma },
      baseInput({ gateContext: goodGateContext({ percentRolloutActive: true }) }),
      {
        rollbackEnv: enabledRollbackEnv({ percentEnabled: true, productionPercent: 5 }),
      },
    );
    expect(result.blockedReasons).toContain("percent_rollout_active");
    expect(result.blockedReasons).toContain("rollback_would_mutate_percent");
  });

  it("13. snapshot missing blocks", async () => {
    const { prisma } = mockPrisma({ snapshot: null });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.blockedReasons).toContain("snapshot_not_found");
  });

  it("14. snapshot already rolled back blocks", async () => {
    const { prisma } = mockPrisma({
      snapshot: goodSnapshot({ rolledBack: true, promotionStatus: "rollback_completed" }),
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.blockedReasons).toContain("snapshot_already_rolled_back");
  });

  it("15. snapshot not applied blocks", async () => {
    const { prisma } = mockPrisma({
      snapshot: goodSnapshot({ promotionStatus: "snapshot_created" }),
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.blockedReasons).toContain("snapshot_not_applied");
  });

  it("16. sidecar missing blocks", async () => {
    const { prisma } = mockPrisma({
      snapshot: goodSnapshot(),
      sidecar: null,
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.blockedReasons).toContain("sidecar_not_found");
  });

  it("17. sidecar not promoted blocks", async () => {
    const { prisma } = mockPrisma({
      snapshot: goodSnapshot(),
      sidecar: goodSidecar({ promotionStatus: "not_promoted" }),
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.blockedReasons).toContain("sidecar_not_promoted");
  });

  it("18. sidecar already rolled back blocks", async () => {
    const { prisma } = mockPrisma({
      snapshot: goodSnapshot(),
      sidecar: goodSidecar({ rolledBack: true, promotionStatus: "rolled_back" }),
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.blockedReasons).toContain("sidecar_already_rolled_back");
  });

  it("19. sidecar appliedToWorkerRanking=true blocks", async () => {
    const { prisma } = mockPrisma({
      snapshot: goodSnapshot(),
      sidecar: goodSidecar({ appliedToWorkerRanking: true }),
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.blockedReasons).toContain("sidecar_applied_to_worker_ranking");
  });

  it("20. MatchResult missing blocks", async () => {
    const { prisma } = mockPrisma({
      snapshot: goodSnapshot(),
      sidecar: goodSidecar(),
      matchResult: null,
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.blockedReasons).toContain("match_result_not_found");
  });

  it("21. snapshot mismatch blocks", async () => {
    const { prisma } = mockPrisma({
      snapshot: goodSnapshot({ sidecarId: "other-sidecar" }),
      sidecar: goodSidecar(),
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.blockedReasons).toContain("snapshot_mismatch");
  });

  it("22. current MatchResult does not match applied state blocks", async () => {
    const { prisma } = mockPrisma({
      snapshot: goodSnapshot(),
      sidecar: goodSidecar(),
      matchResult: goodMatchResultApplied({ candidateUserId: CAND_BEFORE }),
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.blockedReasons).toContain(
      "current_match_result_not_matching_applied_state",
    );
  });

  it("23. restore payload missing blocks", async () => {
    const { prisma } = mockPrisma({
      snapshot: goodSnapshot({ beforeCandidateUserId: "" }),
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.blockedReasons).toContain("baseline_restore_payload_missing");
  });

  it("24. disabled path does not call update / transaction", async () => {
    const mr = goodMatchResultApplied();
    const { prisma, transaction, matchResultUpdate } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(),
      matchResult: mr,
    });
    await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: readP76CanonicalRollbackEnv(),
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(matchResultUpdate).not.toHaveBeenCalled();
  });

  it("25. enabled all-pass restores MatchResult to before snapshot", async () => {
    const mr = goodMatchResultApplied();
    const { prisma, matchResultUpdate } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(),
      matchResult: mr,
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.rolledBack).toBe(true);
    expect(matchResultUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MR_ID },
        data: expect.objectContaining({
          candidateUserId: CAND_BEFORE,
          finalScore: 0.7,
          reasonSummary: "baseline",
        }),
      }),
    );
    expect(result.restored?.candidateUserId).toBe(CAND_BEFORE);
  });

  it("26. enabled all-pass marks sidecar rolled_back", async () => {
    const mr = goodMatchResultApplied();
    const { prisma, sidecarUpdate } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(),
      matchResult: mr,
    });
    await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(sidecarUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          promotionStatus: "rolled_back",
          rolledBack: true,
          appliedToMatchResult: false,
          appliedToWorkerRanking: false,
        }),
      }),
    );
  });

  it("27. enabled all-pass marks snapshot rollback_completed", async () => {
    const mr = goodMatchResultApplied();
    const { prisma, snapshotUpdate } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(),
      matchResult: mr,
    });
    await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(snapshotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          promotionStatus: "rollback_completed",
          rolledBack: true,
        }),
      }),
    );
  });

  it("28. enabled all-pass never sets appliedToWorkerRanking", async () => {
    const mr = goodMatchResultApplied();
    const { prisma, sidecarUpdate } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(),
      matchResult: mr,
    });
    await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(sidecarUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ appliedToWorkerRanking: false }),
      }),
    );
  });

  it("29. enabled all-pass does not trigger worker", async () => {
    const mr = goodMatchResultApplied();
    const { prisma } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(),
      matchResult: mr,
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.safety.triggersWorker).toBe(false);
  });

  it("30. enabled all-pass does not mutate percent", async () => {
    const mr = goodMatchResultApplied();
    const { prisma } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(),
      matchResult: mr,
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    expect(result.safety.changesPercent).toBe(false);
    expect(result.blockedReasons).not.toContain("rollback_would_mutate_percent");
  });

  it("31. rollback result does not expose plaintext token", async () => {
    const mr = goodMatchResultApplied();
    const { prisma } = mockPrisma({
      sidecar: goodSidecar(),
      snapshot: goodSnapshot(),
      matchResult: mr,
    });
    const result = await rollbackP76CanonicalApply({ prisma }, baseInput(), {
      rollbackEnv: enabledRollbackEnv(),
      tokenPepper: PEPPER,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(FAKE_TOKEN);
    expect(result.audit.tokenVerified).toBe(true);
  });
});
