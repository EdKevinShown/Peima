import type { P76AllowlistApplyEnv } from "../src/modules/matching/p76-allowlist-apply-env";
import type { P76AllowlistApplyInputV1 } from "../src/modules/matching/p76-allowlist-apply-meta.types";
import {
  assertP76AllowlistApplyForbiddenFlagsFalse,
  assertP76AllowlistApplyResultPrivacySafe,
  buildP76AllowlistApplyMetaV1,
  evaluateP76AllowlistApplyEligibility,
  P76AllowlistApplyWriterError,
  rollbackP76AllowlistApplyMeta,
  writeP76AllowlistApplyMeta,
  type P76AllowlistApplyWriterPrisma,
} from "../src/modules/matching/p76-allowlist-apply-writer";

function baseInput(
  overrides: Partial<P76AllowlistApplyInputV1> = {},
): P76AllowlistApplyInputV1 {
  return {
    viewerUserId: "viewer-1",
    selectedCandidateId: "cand-1",
    sourceVersion: "p7.6-r7j3-staging-cohort-v1",
    stage1SelectedCandidateIds: ["cand-1", "cand-2"],
    stage2Top2CandidateIds: ["cand-1", "cand-2"],
    finalShadowSelectedCandidateId: "cand-1",
    pmSignoffStatus: "approved",
    opsSignoffStatus: "approved",
    cliDryRun: true,
    ...overrides,
  };
}

function openEnv(overrides: Partial<P76AllowlistApplyEnv> = {}): P76AllowlistApplyEnv {
  return {
    enabled: true,
    dryRun: false,
    viewerAllowlist: ["viewer-1"],
    poolSourceVersion: "p7.6-r7j3-staging-cohort-v1",
    requirePmSignoff: true,
    requireOpsSignoff: true,
    ...overrides,
  };
}

function mockPrisma(): P76AllowlistApplyWriterPrisma & {
  upsert: jest.Mock;
  findUnique: jest.Mock;
  update: jest.Mock;
  matchResultUpdate: jest.Mock;
} {
  const upsert = jest.fn().mockResolvedValue({ id: "row-1" });
  const findUnique = jest.fn().mockResolvedValue(null);
  const update = jest.fn().mockResolvedValue({ id: "row-1" });
  const matchResultUpdate = jest.fn();
  return {
    upsert,
    findUnique,
    update,
    matchResultUpdate,
    p76AllowlistApplyMeta: {
      upsert,
      findUnique,
      update,
    },
    matchResult: { update: matchResultUpdate },
  };
}

describe("p76 allowlist apply writer", () => {
  it("evaluate blocks when not allowlisted", () => {
    const r = evaluateP76AllowlistApplyEligibility(
      baseInput(),
      openEnv({ viewerAllowlist: ["other"] }),
    );
    expect(r.blockedReasons).toContain("viewer_not_allowlisted");
  });

  it("evaluate blocks when apply disabled", () => {
    const r = evaluateP76AllowlistApplyEligibility(
      baseInput(),
      openEnv({ enabled: false }),
    );
    expect(r.blockedReasons).toContain("apply_disabled");
  });

  it("evaluate blocks missing PM signoff", () => {
    const r = evaluateP76AllowlistApplyEligibility(
      baseInput({ pmSignoffStatus: "pending" }),
      openEnv(),
    );
    expect(r.blockedReasons).toContain("pm_signoff_required");
  });

  it("evaluate blocks missing Ops signoff", () => {
    const r = evaluateP76AllowlistApplyEligibility(
      baseInput({ opsSignoffStatus: "pending" }),
      openEnv(),
    );
    expect(r.blockedReasons).toContain("ops_signoff_required");
  });

  it("evaluate blocks final shadow mismatch", () => {
    const r = evaluateP76AllowlistApplyEligibility(
      baseInput({ finalShadowSelectedCandidateId: "other" }),
      openEnv(),
    );
    expect(r.blockedReasons).toContain("final_shadow_mismatch");
  });

  it("dryRun=true does not write DB but wouldApply when gates pass", async () => {
    const prisma = mockPrisma();
    const result = await writeP76AllowlistApplyMeta(
      prisma,
      baseInput({ cliDryRun: true }),
      openEnv({ dryRun: true }),
    );
    expect(result.wouldApply).toBe(true);
    expect(result.wroteSidecar).toBe(false);
    expect(result.effectiveDryRun).toBe(true);
    expect(prisma.upsert).not.toHaveBeenCalled();
    expect(result.applied).toBe(false);
  });

  it("enabled=false blocks write", async () => {
    const prisma = mockPrisma();
    const result = await writeP76AllowlistApplyMeta(
      prisma,
      baseInput({ cliDryRun: false }),
      openEnv({ enabled: false }),
    );
    expect(result.blocked).toBe(true);
    expect(result.wouldApply).toBe(false);
    expect(prisma.upsert).not.toHaveBeenCalled();
  });

  it("allowlist hit + dryRun=false + signoffs ok writes sidecar only", async () => {
    const prisma = mockPrisma();
    const result = await writeP76AllowlistApplyMeta(
      prisma,
      baseInput({ cliDryRun: false }),
      openEnv({ dryRun: false }),
    );
    expect(result.wouldApply).toBe(true);
    expect(result.wroteSidecar).toBe(true);
    expect(result.sidecarRowId).toBe("row-1");
    expect(prisma.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.matchResultUpdate).not.toHaveBeenCalled();
    const createArg = prisma.upsert.mock.calls[0]![0].create as Record<
      string,
      unknown
    >;
    expect(createArg.appliedToMatchResult).toBe(false);
    expect(createArg.appliedToFinalScore).toBe(false);
    expect(createArg.appliedToWorkerRanking).toBe(false);
    expect(result.applied).toBe(false);
  });

  it("env dryRun overrides cli dryRun=false", async () => {
    const prisma = mockPrisma();
    const result = await writeP76AllowlistApplyMeta(
      prisma,
      baseInput({ cliDryRun: false }),
      openEnv({ dryRun: true }),
    );
    expect(result.wouldApply).toBe(true);
    expect(result.wroteSidecar).toBe(false);
    expect(prisma.upsert).not.toHaveBeenCalled();
  });

  it("rejects appliedToMatchResult=true", () => {
    expect(() =>
      assertP76AllowlistApplyForbiddenFlagsFalse({
        appliedToMatchResult: true,
      }),
    ).toThrow(P76AllowlistApplyWriterError);
  });

  it("rejects appliedToFinalScore=true", () => {
    expect(() =>
      buildP76AllowlistApplyMetaV1(
        baseInput({ appliedToFinalScore: true }),
        { allowlistMatched: true, effectiveDryRun: true, applied: false },
      ),
    ).toThrow(P76AllowlistApplyWriterError);
  });

  it("rejects appliedToWorkerRanking=true", () => {
    expect(() =>
      buildP76AllowlistApplyMetaV1(
        baseInput({ appliedToWorkerRanking: true }),
        { allowlistMatched: true, effectiveDryRun: true, applied: false },
      ),
    ).toThrow(P76AllowlistApplyWriterError);
  });

  it("upserts on repeated viewer/sourceVersion", async () => {
    const prisma = mockPrisma();
    const env = openEnv({ dryRun: false });
    const input = baseInput({ cliDryRun: false });
    await writeP76AllowlistApplyMeta(prisma, input, env);
    await writeP76AllowlistApplyMeta(prisma, input, env);
    expect(prisma.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.upsert.mock.calls[0]![0].where).toEqual({
      viewerUserId_sourceVersion: {
        viewerUserId: "viewer-1",
        sourceVersion: "p7.6-r7j3-staging-cohort-v1",
      },
    });
  });

  it("rollback updates sidecar only", async () => {
    const prisma = mockPrisma();
    const out = await rollbackP76AllowlistApplyMeta(prisma, {
      viewerUserId: "viewer-1",
      sourceVersion: "p7.6-r7j3-staging-cohort-v1",
      rolledBackBy: "ops",
      rollbackReason: "test",
      rollbackToken: "tok-1",
    });
    expect(out.rolledBack).toBe(true);
    expect(prisma.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rolledBack: true,
          dryRun: true,
          applied: false,
        }),
      }),
    );
  });

  it("privacy safe on result", () => {
    expect(() =>
      assertP76AllowlistApplyResultPrivacySafe({
        meta: { auditNotes: { imageUrl: "http://x" } },
      }),
    ).toThrow(P76AllowlistApplyWriterError);
  });
});
