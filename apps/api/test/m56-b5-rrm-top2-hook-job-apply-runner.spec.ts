import type { MatchResult } from "@peima/database";
import { RRM_SIM_SOURCE_VERSION } from "../src/modules/ai-simulation-v1/rrm-sim.constants";
import {
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
  RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE,
  type RrmSimReadonlySummaryPayloadV1,
} from "../src/modules/matching/matching-rrm-sim-readonly-summary";
import type {
  WriteRrmTop2DisplayMetaForMatchResultInput,
  WriteRrmTop2DisplayMetaForMatchResultResult,
} from "../src/modules/matching/matching-rrm-top2-display-meta-writer";
import * as hookJobSvc from "../src/modules/matching/rrm-top2-hook-job.service";
import * as applySvc from "../src/modules/matching/rrm-top2-hook-job-apply.service";
import {
  isM56B5WriterNoOpSkipReason,
  M56_B5_WRITER_NO_OP_SKIP_CODES,
  parseM56B5ApplyArgs,
  runM56B5HookJobApplyRunner,
  type M56B5ApplyAggregateOk,
  type M56B5ApplyRunnerPrisma,
} from "../src/dev-cli/m56-b5-rrm-top2-hook-job-apply-runner";
import { processRrmTop2HookJobDryRun } from "../src/modules/matching/rrm-top2-hook-job-consumer";
import { RRM_TOP2_HOOK_JOB_STATUS, type RrmTop2HookJobRow } from "../src/modules/matching/rrm-top2-hook-job.types";
import type { RrmTop2DisplayMetaGuardrailsV1 } from "../src/modules/matching/rrm-top2-display-meta.types";

function passGr(over: Partial<RrmTop2DisplayMetaGuardrailsV1> = {}): RrmTop2DisplayMetaGuardrailsV1 {
  return {
    status: "pass",
    blockReasons: [],
    cautionReasons: [],
    sourceVersion: "m5-test-guardrails-v1",
    ...over,
  };
}

function rrmSummary(winner: string, baseline: string): RrmSimReadonlySummaryPayloadV1 {
  return {
    schemaVersion: 1,
    sourceType: RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE,
    sourceVersion: RRM_SIM_SOURCE_VERSION,
    candidateUserId: baseline,
    winnerUserId: winner,
    proposalCandidateUserId: winner,
    scenarioKey: null,
    suggestedAction: "maintain",
    progressionWindow: null,
    simulatedRhythmScore: 1,
    recommendation: "ok",
    confidenceBucket: "high" as const,
    fallbackUsed: false,
    unavailableReason: null,
    cautionFlags: [],
    generatedAt: "2026-05-03T00:00:00.000Z",
    frozenAt: null,
  };
}

function mr(over: Partial<MatchResult> = {}): MatchResult {
  return {
    id: "mr-w1",
    userId: "viewer-1",
    candidateUserId: "cand-a",
    batchId: "b1",
    finalScore: 0.7,
    reasonSummary: "ok",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    matchInsights: { [RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY]: rrmSummary("cand-b", "cand-a") },
    ...over,
  } as MatchResult;
}

function baseJob(over: Partial<RrmTop2HookJobRow> = {}): RrmTop2HookJobRow {
  const now = new Date();
  return {
    id: "job-hook-1",
    matchResultId: "mr-w1",
    viewerUserId: "viewer-1",
    sourceVersion: "m5.6-b5-test-v1",
    status: RRM_TOP2_HOOK_JOB_STATUS.PENDING,
    staticTop2Snapshot: {
      kind: "rrm_top2_static_snapshot_v1",
      candidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      source: "test",
    },
    top2Fingerprint: "fp1",
    rrmSourceType: "test",
    rrmSourceId: null,
    rrmSummarySourceVersion: null,
    guardrails: passGr(),
    noOpReasonCode: null,
    attempts: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    lockedAt: null,
    processedAt: null,
    metaWriteResult: null,
    auditMeta: null,
    aiSimulationJobId: null,
    pairwiseJobId: null,
    poolId: null,
    batchId: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  } as RrmTop2HookJobRow;
}

function prismaFactory(over: {
  row?: MatchResult | null;
  findMany?: jest.Mock;
  hookUpdate?: jest.Mock;
}): M56B5ApplyRunnerPrisma {
  const row = over.row === undefined ? mr() : over.row;
  const matchUpdate = jest.fn(async () => ({}));
  const metaUpsert = jest.fn(async () => ({}));
  const findMany =
    over.findMany ??
    jest.fn(async () => {
      return [];
    });
  return {
    matchResultRrmTop2DisplayHookJob: {
      findMany,
      findUnique: jest.fn(),
      create: jest.fn(),
      update: over.hookUpdate ?? jest.fn(),
    },
    matchResult: {
      findUnique: jest.fn(async () => row),
      update: matchUpdate,
    },
    matchResultRrmTop2DisplayMeta: {
      findUnique: jest.fn(async () => null),
      upsert: metaUpsert,
    },
    user: {
      findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) =>
        ["cand-a", "cand-b"].includes(id) ? { id } : null,
      ),
    },
  } as unknown as M56B5ApplyRunnerPrisma;
}

function expectApplyOk(r: unknown): asserts r is M56B5ApplyAggregateOk {
  if (r == null || typeof r !== "object" || !("mode" in r)) {
    throw new Error("expected aggregate");
  }
  if ("refused" in r && (r as { refused?: boolean }).refused) {
    throw new Error("unexpected refused");
  }
  if ((r as { mode?: string }).mode !== "apply") {
    throw new Error("expected apply mode");
  }
}

describe("m56-b5-rrm-top2-hook-job-apply-runner (M5.6-B5-B)", () => {
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("production env refuses", async () => {
    process.env.NODE_ENV = "production";
    const p = prismaFactory({});
    const r = await runM56B5HookJobApplyRunner(p, {
      limit: 1,
      pretty: false,
      apply: false,
      confirmControlledApply: false,
    });
    expect(r).toEqual({ refused: true, reason: "node_env_production" });
  });

  it("dry-run does not call markRrmTop2HookJobProcessing", async () => {
    process.env.NODE_ENV = "test";
    const markP = jest.spyOn(hookJobSvc, "markRrmTop2HookJobProcessing");
    const findMany = jest.fn(async () => [baseJob()]);
    const p = prismaFactory({ findMany });
    const r = await runM56B5HookJobApplyRunner(
      p,
      { limit: 1, pretty: false, apply: false, confirmControlledApply: false },
      { findPendingRrmTop2HookJobs: async () => [baseJob()], processRrmTop2HookJobDryRun },
    );
    expect("refused" in r && r.refused).toBe(false);
    if (!("refused" in r) || r.refused) throw new Error("expected dry-run");
    expect(r.mode).toBe("dry_run");
    expect(markP).not.toHaveBeenCalled();
    markP.mockRestore();
  });

  it("no --apply → delegates to shared dry-run aggregate", async () => {
    process.env.NODE_ENV = "test";
    const spy = jest.spyOn(applySvc, "processRrmTop2HookJobsDryRunAggregate");
    const p = prismaFactory({});
    await runM56B5HookJobApplyRunner(p, {
      limit: 2,
      pretty: false,
      apply: false,
      confirmControlledApply: false,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ prisma: p, limit: 2 });
    spy.mockRestore();
  });

  it("--apply without confirm → refused, no mark calls", async () => {
    process.env.NODE_ENV = "test";
    const markP = jest.spyOn(hookJobSvc, "markRrmTop2HookJobProcessing");
    const applySpy = jest.spyOn(applySvc, "processRrmTop2HookJobsApplyBatch");
    const p = prismaFactory({});
    const r = await runM56B5HookJobApplyRunner(p, {
      limit: 1,
      pretty: false,
      apply: true,
      confirmControlledApply: false,
    });
    expect(r).toMatchObject({ refused: true, reason: "apply_confirmation_required" });
    expect(markP).not.toHaveBeenCalled();
    expect(applySpy).not.toHaveBeenCalled();
    markP.mockRestore();
    applySpy.mockRestore();
  });

  it("--apply + confirm → delegates to shared apply batch", async () => {
    process.env.NODE_ENV = "test";
    const job = baseJob();
    const applySpy = jest.spyOn(applySvc, "processRrmTop2HookJobsApplyBatch");
    const writer = jest.fn(
      async (): Promise<WriteRrmTop2DisplayMetaForMatchResultResult> => ({
        ok: true,
        dryRun: false,
        wroteSummary: false,
        wroteMeta: true,
        noOpReasonCode: null,
        matchResultId: job.matchResultId,
        sourceVersion: "sv",
        displayCandidateUserId: "cand-b",
        candidateUserIdUnchanged: true,
        finalScoreUnchanged: true,
      }),
    );
    const p = prismaFactory({});
    await runM56B5HookJobApplyRunner(
      p,
      { limit: 1, pretty: false, apply: true, confirmControlledApply: true },
      { findPendingRrmTop2HookJobs: async () => [job], writeRrmTop2DisplayMetaForMatchResult: writer },
    );
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy.mock.calls[0][0]).toMatchObject({ prisma: p, limit: 1 });
    applySpy.mockRestore();
  });

  it("parse: default limit 1, max 10", () => {
    expect(parseM56B5ApplyArgs([])).toEqual({
      limit: 1,
      pretty: false,
      apply: false,
      confirmControlledApply: false,
    });
    expect(parseM56B5ApplyArgs(["--limit=0"])).toMatchObject({ limit: 1 });
    expect(parseM56B5ApplyArgs(["--limit=99"])).toMatchObject({ limit: 10 });
  });

  it("apply: pending → processing then processed when writer ok + wroteMeta", async () => {
    process.env.NODE_ENV = "test";
    const job = baseJob();
    const markP = jest.spyOn(hookJobSvc, "markRrmTop2HookJobProcessing");
    const markOk = jest.spyOn(hookJobSvc, "markRrmTop2HookJobProcessed");
    const writer = jest.fn(
      async (): Promise<WriteRrmTop2DisplayMetaForMatchResultResult> => ({
        ok: true,
        dryRun: false,
        wroteSummary: false,
        wroteMeta: true,
        noOpReasonCode: null,
        matchResultId: job.matchResultId,
        sourceVersion: "sv",
        displayCandidateUserId: "cand-b",
        candidateUserIdUnchanged: true,
        finalScoreUnchanged: true,
      }),
    );
    const p = prismaFactory({});
    const r = await runM56B5HookJobApplyRunner(
      p,
      { limit: 1, pretty: false, apply: true, confirmControlledApply: true },
      {
        findPendingRrmTop2HookJobs: async () => [job],
        writeRrmTop2DisplayMetaForMatchResult: writer,
      },
    );
    expectApplyOk(r);
    expect(r.processedCount).toBe(1);
    expect(markP).toHaveBeenCalledWith({ prisma: p, jobId: job.id });
    expect(markOk).toHaveBeenCalled();
    const firstCall = (writer as jest.Mock).mock.calls[0]?.[0] as WriteRrmTop2DisplayMetaForMatchResultInput;
    expect(firstCall.dryRun).toBe(false);
    expect(p.matchResult.update).not.toHaveBeenCalled();
    markP.mockRestore();
    markOk.mockRestore();
  });

  it("apply: existing_meta_frozen → skipped", async () => {
    process.env.NODE_ENV = "test";
    const job = baseJob();
    const markSkip = jest.spyOn(hookJobSvc, "markRrmTop2HookJobSkipped");
    const writer = jest.fn(
      async (): Promise<WriteRrmTop2DisplayMetaForMatchResultResult> => ({
        ok: false,
        dryRun: false,
        wroteSummary: false,
        wroteMeta: false,
        noOpReasonCode: "existing_meta_frozen",
        matchResultId: job.matchResultId,
        sourceVersion: "sv",
        displayCandidateUserId: null,
        candidateUserIdUnchanged: true,
        finalScoreUnchanged: true,
      }),
    );
    const p = prismaFactory({});
    const r = await runM56B5HookJobApplyRunner(
      p,
      { limit: 1, pretty: false, apply: true, confirmControlledApply: true },
      { findPendingRrmTop2HookJobs: async () => [job], writeRrmTop2DisplayMetaForMatchResult: writer },
    );
    expectApplyOk(r);
    expect(r.skippedCount).toBe(1);
    expect(markSkip).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: job.id, noOpReasonCode: "existing_meta_frozen" }),
    );
    markSkip.mockRestore();
  });

  it("apply: rrm_summary_missing preflight → skipped", async () => {
    process.env.NODE_ENV = "test";
    const job = baseJob();
    const markSkip = jest.spyOn(hookJobSvc, "markRrmTop2HookJobSkipped");
    const writer = jest.fn();
    const p = prismaFactory({ row: mr({ matchInsights: {} }) });
    const r = await runM56B5HookJobApplyRunner(
      p,
      { limit: 1, pretty: false, apply: true, confirmControlledApply: true },
      { findPendingRrmTop2HookJobs: async () => [job], writeRrmTop2DisplayMetaForMatchResult: writer },
    );
    expectApplyOk(r);
    expect(r.skippedCount).toBe(1);
    expect(markSkip).toHaveBeenCalledWith(expect.objectContaining({ noOpReasonCode: "rrm_summary_missing" }));
    expect(writer).not.toHaveBeenCalled();
    markSkip.mockRestore();
  });

  it("apply: writer_disabled → skipped", async () => {
    process.env.NODE_ENV = "test";
    const job = baseJob();
    const writer = jest.fn(
      async (): Promise<WriteRrmTop2DisplayMetaForMatchResultResult> => ({
        ok: false,
        dryRun: false,
        wroteSummary: false,
        wroteMeta: false,
        noOpReasonCode: "writer_disabled",
        matchResultId: job.matchResultId,
        sourceVersion: "sv",
        displayCandidateUserId: null,
        candidateUserIdUnchanged: true,
        finalScoreUnchanged: true,
      }),
    );
    const p = prismaFactory({});
    const r = await runM56B5HookJobApplyRunner(
      p,
      { limit: 1, pretty: false, apply: true, confirmControlledApply: true },
      { findPendingRrmTop2HookJobs: async () => [job], writeRrmTop2DisplayMetaForMatchResult: writer },
    );
    expectApplyOk(r);
    expect(r.items[0].outcome).toBe("skipped");
    expect(r.items[0].noOpReasonCode).toBe("writer_disabled");
  });

  it("apply: writer throw → failed + sanitize", async () => {
    process.env.NODE_ENV = "test";
    const job = baseJob();
    const hookUpdate = jest.fn(async () => job) as jest.Mock;
    const p = prismaFactory({ hookUpdate });
    const writer = jest.fn(async () => {
      throw new Error("sk-testkey1234567890123456789012 failure");
    });
    const r = await runM56B5HookJobApplyRunner(
      p,
      { limit: 1, pretty: false, apply: true, confirmControlledApply: true },
      { findPendingRrmTop2HookJobs: async () => [job], writeRrmTop2DisplayMetaForMatchResult: writer },
    );
    expectApplyOk(r);
    expect(r.failedCount).toBe(1);
    const failedCall = hookUpdate.mock.calls.find(
      (c: unknown[]) => (c[0] as { data?: { status?: string } }).data?.status === RRM_TOP2_HOOK_JOB_STATUS.FAILED,
    );
    expect(failedCall).toBeDefined();
    const msg = (failedCall![0] as unknown as { data?: { lastErrorMessage?: string | null } }).data
      ?.lastErrorMessage;
    expect(String(msg)).toContain("[REDACTED_API_KEY]");
  });

  it("existing_meta_frozen is in skip code set", () => {
    expect(M56_B5_WRITER_NO_OP_SKIP_CODES.has("existing_meta_frozen")).toBe(true);
    expect(isM56B5WriterNoOpSkipReason("existing_meta_frozen")).toBe(true);
  });

  it("dry-run aggregate JSON has no DATABASE_URL pattern", async () => {
    process.env.NODE_ENV = "test";
    const p = prismaFactory({});
    const r = await runM56B5HookJobApplyRunner(p, {
      limit: 1,
      pretty: false,
      apply: false,
      confirmControlledApply: false,
    });
    const s = JSON.stringify(r);
    expect(s).not.toMatch(/DATABASE_URL/i);
    expect(s).not.toMatch(/postgres:\/\//i);
  });
});
