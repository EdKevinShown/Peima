import type { MatchResult } from "@peima/database";
import { RRM_SIM_SOURCE_VERSION } from "../src/modules/ai-simulation-v1/rrm-sim.constants";
import {
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
  RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE,
  type RrmSimReadonlySummaryPayloadV1,
} from "../src/modules/matching/matching-rrm-sim-readonly-summary";
import * as writerMod from "../src/modules/matching/matching-rrm-top2-display-meta-writer";
import * as hookJobSvc from "../src/modules/matching/rrm-top2-hook-job.service";
import {
  formatM56B4bConsumerOutput,
  parseM56B4bConsumerArgs,
  runM56B4bHookJobConsumerDryRunRunner,
  type M56B4bConsumerRunnerPrisma,
} from "../src/dev-cli/m56-b4b-rrm-top2-hook-job-consumer-runner";
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
    sourceVersion: "m5.6-b4b-test-v1",
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
}): M56B4bConsumerRunnerPrisma {
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
  } as unknown as M56B4bConsumerRunnerPrisma;
}

describe("m56-b4b-rrm-top2-hook-job-consumer-runner (M5.6-B4B)", () => {
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("parse: --apply is rejected", () => {
    expect(parseM56B4bConsumerArgs(["--apply"])).toEqual({ ok: false, reason: "apply_not_supported" });
    expect(parseM56B4bConsumerArgs(["--apply=1"])).toEqual({ ok: false, reason: "apply_not_supported" });
  });

  it("parse: default limit 10, max 100", () => {
    expect(parseM56B4bConsumerArgs([])).toEqual({ ok: true, opts: { limit: 10, pretty: false } });
    expect(parseM56B4bConsumerArgs(["--limit=0"])).toEqual({ ok: true, opts: { limit: 1, pretty: false } });
    expect(parseM56B4bConsumerArgs(["--limit=999"])).toEqual({ ok: true, opts: { limit: 100, pretty: false } });
  });

  it("production env refuses runner", async () => {
    process.env.NODE_ENV = "production";
    const p = prismaFactory({});
    const r = await runM56B4bHookJobConsumerDryRunRunner(p, { limit: 10, pretty: false });
    expect(r).toEqual({ refused: true, reason: "node_env_production" });
  });

  it("calls findPendingRrmTop2HookJobs and processRrmTop2HookJobDryRun per job; aggregate counts", async () => {
    process.env.NODE_ENV = "test";
    const j1 = baseJob({ id: "j1" });
    const j2 = baseJob({
      id: "j2",
      staticTop2Snapshot: null,
    });
    const findPending = jest.fn(async (input: { prisma: unknown; limit?: number }) => {
      expect(input.limit).toBe(10);
      return [j1, j2];
    });
    const p = prismaFactory({});

    const r = await runM56B4bHookJobConsumerDryRunRunner(
      p,
      { limit: 10, pretty: false },
      { findPendingRrmTop2HookJobs: findPending as typeof hookJobSvc.findPendingRrmTop2HookJobs },
    );

    expect(findPending).toHaveBeenCalledWith({ prisma: p, limit: 10 });
    expect("refused" in r && r.refused).toBe(false);
    if (!("refused" in r) || r.refused) throw new Error("expected aggregate");
    const ok = r;
    expect(ok.totalJobsRead).toBe(2);
    expect(ok.wouldProcessCount).toBe(1);
    expect(ok.wouldSkipCount).toBe(1);
    expect(ok.noOpReasonCounts.static_top2_missing).toBe(1);
    expect(ok.writerOkCount).toBe(1);
    expect(ok.writerNoOpCount).toBe(0);
    expect(ok.items).toEqual([
      { index: 0, wouldProcess: true, wouldSkip: false, noOpReasonCode: null },
      { index: 1, wouldProcess: false, wouldSkip: true, noOpReasonCode: "static_top2_missing" },
    ]);
  });

  it("does not call mark* hook job helpers", async () => {
    process.env.NODE_ENV = "test";
    const markP = jest.spyOn(hookJobSvc, "markRrmTop2HookJobProcessing");
    const markOk = jest.spyOn(hookJobSvc, "markRrmTop2HookJobProcessed");
    const markSkip = jest.spyOn(hookJobSvc, "markRrmTop2HookJobSkipped");
    const markFail = jest.spyOn(hookJobSvc, "markRrmTop2HookJobFailed");
    const findMany = jest.fn(async () => [baseJob()]);
    const p = prismaFactory({ findMany });
    await runM56B4bHookJobConsumerDryRunRunner(p, { limit: 5, pretty: false });
    expect(markP).not.toHaveBeenCalled();
    expect(markOk).not.toHaveBeenCalled();
    expect(markSkip).not.toHaveBeenCalled();
    expect(markFail).not.toHaveBeenCalled();
    markP.mockRestore();
    markOk.mockRestore();
    markSkip.mockRestore();
    markFail.mockRestore();
  });

  it("integration: writer dryRun only; no matchResult.update or meta upsert; no hook job update", async () => {
    process.env.NODE_ENV = "test";
    const writerSpy = jest.spyOn(writerMod, "writeRrmTop2DisplayMetaForMatchResult");
    const findMany = jest.fn(async () => [baseJob()]);
    const hookUpdate = jest.fn();
    const p = prismaFactory({ findMany, hookUpdate });

    const r = await runM56B4bHookJobConsumerDryRunRunner(p, { limit: 10, pretty: false }, {});

    expect("refused" in r && r.refused).toBe(false);
    expect(writerSpy).toHaveBeenCalled();
    const arg = writerSpy.mock.calls[0][0];
    expect(arg.dryRun).toBe(true);
    expect(p.matchResult.update).not.toHaveBeenCalled();
    expect(p.matchResultRrmTop2DisplayMeta.upsert).not.toHaveBeenCalled();
    expect(p.matchResultRrmTop2DisplayHookJob.update).not.toHaveBeenCalled();
    writerSpy.mockRestore();
  });

  it("formatted output omits raw ids and common secret patterns", async () => {
    process.env.NODE_ENV = "test";
    const findMany = jest.fn(async () => [baseJob()]);
    const p = prismaFactory({ findMany });
    const r = await runM56B4bHookJobConsumerDryRunRunner(p, { limit: 10, pretty: false }, {
      processRrmTop2HookJobDryRun: async () => ({
        jobId: "secret-job-id-xyz",
        matchResultId: "secret-mr-abc",
        wouldProcess: false,
        wouldSkip: true,
        noOpReasonCode: "guardrails_invalid",
        writerResult: null,
        candidateUserIdUnchanged: true,
        finalScoreUnchanged: true,
      }),
    });
    const s = formatM56B4bConsumerOutput(r, false);
    const parsed = JSON.parse(s) as { items: Array<Record<string, unknown>> };
    expect(parsed.items[0]).not.toHaveProperty("jobId");
    expect(parsed.items[0]).not.toHaveProperty("matchResultId");
    expect(s).not.toContain("secret-job-id");
    expect(s).not.toContain("secret-mr");
    expect(s).not.toContain("sk-testkey1234567890");
    expect(s).not.toMatch(/DATABASE_URL/i);
    expect(s).not.toMatch(/Bearer\s+/i);
    expect(s).not.toMatch(/postgres:\/\//i);
    expect(s).not.toMatch(/raw\s*prompt/i);
    expect(s).not.toMatch(/transcript/i);
  });

  it("real processRrmTop2HookJobDryRun path: writer calls use dryRun true", async () => {
    process.env.NODE_ENV = "test";
    const writerSpy = jest.spyOn(writerMod, "writeRrmTop2DisplayMetaForMatchResult");
    const findMany = jest.fn(async () => [baseJob()]);
    const p = prismaFactory({ findMany });
    await runM56B4bHookJobConsumerDryRunRunner(p, { limit: 10, pretty: false }, {
      findPendingRrmTop2HookJobs: async () => [baseJob()],
      processRrmTop2HookJobDryRun,
    });
    expect(writerSpy.mock.calls.every((c) => c[0].dryRun === true)).toBe(true);
    writerSpy.mockRestore();
  });
});
