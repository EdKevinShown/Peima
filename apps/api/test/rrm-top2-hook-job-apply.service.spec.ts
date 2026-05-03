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
import {
  applySingleRrmTop2HookJob,
  mapWriterNoOpToSkippedReason,
  mapWriterResultToHookStatus,
  processRrmTop2HookJobsApplyBatch,
  processRrmTop2HookJobsDryRunAggregate,
  RRM_TOP2_HOOK_WRITER_NO_OP_SKIP_CODES,
  isRrmTop2HookWriterNoOpSkipReason,
  type RrmTop2HookJobApplyPrisma,
} from "../src/modules/matching/rrm-top2-hook-job-apply.service";
import { processRrmTop2HookJobDryRun } from "../src/modules/matching/rrm-top2-hook-job-consumer";
import { RRM_TOP2_HOOK_JOB_STATUS, type RrmTop2HookJobRow } from "../src/modules/matching/rrm-top2-hook-job.types";
import type { RrmTop2DisplayMetaGuardrailsV1 } from "../src/modules/matching/rrm-top2-display-meta.types";

const SOURCE_V = "m5.6-b7b-test-source-v1" as const;

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
    sourceVersion: "m5.6-b7b-test-v1",
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
}): RrmTop2HookJobApplyPrisma {
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
  } as unknown as RrmTop2HookJobApplyPrisma;
}

describe("rrm-top2-hook-job-apply.service (M5.6-B7-B)", () => {
  it("dry-run aggregate does not call markRrmTop2HookJobProcessing", async () => {
    const markP = jest.spyOn(hookJobSvc, "markRrmTop2HookJobProcessing");
    const p = prismaFactory({});
    const r = await processRrmTop2HookJobsDryRunAggregate({
      prisma: p,
      limit: 1,
      sourceVersion: SOURCE_V,
      deps: { findPendingRrmTop2HookJobs: async () => [baseJob()], processRrmTop2HookJobDryRun },
    });
    expect(r.mode).toBe("dry_run");
    expect(markP).not.toHaveBeenCalled();
    markP.mockRestore();
  });

  it("dry-run aggregate shape matches B5-B (wouldProcess / wouldSkip / writer counts)", async () => {
    const p = prismaFactory({});
    const r = await processRrmTop2HookJobsDryRunAggregate({
      prisma: p,
      limit: 2,
      sourceVersion: SOURCE_V,
      deps: { findPendingRrmTop2HookJobs: async () => [baseJob(), baseJob({ id: "job-2" })], processRrmTop2HookJobDryRun },
    });
    expect(r.refused).toBe(false);
    expect(r.apply).toBe(false);
    expect(typeof r.wouldProcessCount).toBe("number");
    expect(typeof r.wouldSkipCount).toBe("number");
    expect(typeof r.writerOkCount).toBe("number");
    expect(typeof r.writerNoOpCount).toBe("number");
    expect(r.candidateUserIdUnchangedAll).toBe(true);
    expect(r.finalScoreUnchangedAll).toBe(true);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({
      index: 0,
      wouldProcess: expect.any(Boolean),
      wouldSkip: expect.any(Boolean),
    });
  });

  it("apply: writer ok + wroteMeta → processed", async () => {
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
    const r = await processRrmTop2HookJobsApplyBatch({
      prisma: p,
      limit: 1,
      sourceVersion: SOURCE_V,
      deps: { findPendingRrmTop2HookJobs: async () => [job], writeRrmTop2DisplayMetaForMatchResult: writer },
    });
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
    const r = await processRrmTop2HookJobsApplyBatch({
      prisma: p,
      limit: 1,
      sourceVersion: SOURCE_V,
      deps: { findPendingRrmTop2HookJobs: async () => [job], writeRrmTop2DisplayMetaForMatchResult: writer },
    });
    expect(r.skippedCount).toBe(1);
    expect(markSkip).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: job.id, noOpReasonCode: "existing_meta_frozen" }),
    );
    markSkip.mockRestore();
  });

  it("apply: rrm_summary_missing preflight → skipped, writer not called", async () => {
    const job = baseJob();
    const markSkip = jest.spyOn(hookJobSvc, "markRrmTop2HookJobSkipped");
    const writer = jest.fn();
    const p = prismaFactory({ row: mr({ matchInsights: {} }) });
    const r = await processRrmTop2HookJobsApplyBatch({
      prisma: p,
      limit: 1,
      sourceVersion: SOURCE_V,
      deps: { findPendingRrmTop2HookJobs: async () => [job], writeRrmTop2DisplayMetaForMatchResult: writer },
    });
    expect(r.skippedCount).toBe(1);
    expect(markSkip).toHaveBeenCalledWith(expect.objectContaining({ noOpReasonCode: "rrm_summary_missing" }));
    expect(writer).not.toHaveBeenCalled();
    markSkip.mockRestore();
  });

  it("apply: writer throw → failed + sanitized lastErrorMessage", async () => {
    const job = baseJob();
    const hookUpdate = jest.fn(async () => job) as jest.Mock;
    const p = prismaFactory({ hookUpdate });
    const writer = jest.fn(async () => {
      throw new Error("sk-testkey1234567890123456789012 failure");
    });
    const r = await processRrmTop2HookJobsApplyBatch({
      prisma: p,
      limit: 1,
      sourceVersion: SOURCE_V,
      deps: { findPendingRrmTop2HookJobs: async () => [job], writeRrmTop2DisplayMetaForMatchResult: writer },
    });
    expect(r.failedCount).toBe(1);
    const failedCall = hookUpdate.mock.calls.find(
      (c: unknown[]) => (c[0] as { data?: { status?: string } }).data?.status === RRM_TOP2_HOOK_JOB_STATUS.FAILED,
    );
    expect(failedCall).toBeDefined();
    const msg = (failedCall![0] as unknown as { data?: { lastErrorMessage?: string | null } }).data?.lastErrorMessage;
    expect(String(msg)).toContain("[REDACTED_API_KEY]");
  });

  it("apply: unlisted writer no-op code → skipped with that code", async () => {
    const job = baseJob();
    const markSkip = jest.spyOn(hookJobSvc, "markRrmTop2HookJobSkipped");
    const writer = jest.fn(
      async (): Promise<WriteRrmTop2DisplayMetaForMatchResultResult> =>
        ({
          ok: false,
          dryRun: false,
          wroteSummary: false,
          wroteMeta: false,
          noOpReasonCode: "totally_unlisted_noop_xyz",
          matchResultId: job.matchResultId,
          sourceVersion: "sv",
          displayCandidateUserId: null,
          candidateUserIdUnchanged: true,
          finalScoreUnchanged: true,
        }) as unknown as WriteRrmTop2DisplayMetaForMatchResultResult,
    );
    const p = prismaFactory({});
    const r = await processRrmTop2HookJobsApplyBatch({
      prisma: p,
      limit: 1,
      sourceVersion: SOURCE_V,
      deps: { findPendingRrmTop2HookJobs: async () => [job], writeRrmTop2DisplayMetaForMatchResult: writer },
    });
    expect(r.items[0].outcome).toBe("skipped");
    expect(r.items[0].noOpReasonCode).toBe("totally_unlisted_noop_xyz");
    expect(isRrmTop2HookWriterNoOpSkipReason("totally_unlisted_noop_xyz")).toBe(false);
    expect(markSkip).toHaveBeenCalled();
    const call = markSkip.mock.calls.find((c) => (c[0] as { noOpReasonCode?: string }).noOpReasonCode === "totally_unlisted_noop_xyz");
    expect(call).toBeDefined();
    const meta = (call![0] as { metaWriteResult?: { note?: string } }).metaWriteResult;
    expect(meta).toMatchObject({ note: "unlisted_no_op_mapped_to_skipped" });
    markSkip.mockRestore();
  });

  it("mapWriterResultToHookStatus: ok+wroteMeta → processed", () => {
    const wr: WriteRrmTop2DisplayMetaForMatchResultResult = {
      ok: true,
      dryRun: false,
      wroteSummary: false,
      wroteMeta: true,
      noOpReasonCode: null,
      matchResultId: "x",
      sourceVersion: "s",
      displayCandidateUserId: null,
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    };
    expect(mapWriterResultToHookStatus(wr)).toBe("processed");
  });

  it("mapWriterNoOpToSkippedReason: ok true but no meta → no_meta_write", () => {
    const wr: WriteRrmTop2DisplayMetaForMatchResultResult = {
      ok: true,
      dryRun: false,
      wroteSummary: false,
      wroteMeta: false,
      noOpReasonCode: null,
      matchResultId: "x",
      sourceVersion: "s",
      displayCandidateUserId: null,
      candidateUserIdUnchanged: true,
      finalScoreUnchanged: true,
    };
    expect(mapWriterNoOpToSkippedReason(wr)).toBe("no_meta_write");
  });

  it("isRrmTop2HookWriterNoOpSkipReason: empty and listed codes", () => {
    expect(isRrmTop2HookWriterNoOpSkipReason("")).toBe(true);
    expect(isRrmTop2HookWriterNoOpSkipReason(null)).toBe(true);
    expect(RRM_TOP2_HOOK_WRITER_NO_OP_SKIP_CODES.has("existing_meta_frozen")).toBe(true);
    expect(isRrmTop2HookWriterNoOpSkipReason("existing_meta_frozen")).toBe(true);
  });

  it("applySingleRrmTop2HookJob does not update MatchResult.candidateUserId or finalScore", async () => {
    const job = baseJob();
    const row = mr({ candidateUserId: "cand-a", finalScore: 0.42 });
    const p = prismaFactory({ row });
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
    await applySingleRrmTop2HookJob({ prisma: p, job, index: 0, deps: { writeRrmTop2DisplayMetaForMatchResult: writer } });
    expect(p.matchResult.update).not.toHaveBeenCalled();
  });
});
