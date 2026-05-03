import type { MatchResult } from "@peima/database";
import { RRM_SIM_SOURCE_VERSION } from "../src/modules/ai-simulation-v1/rrm-sim.constants";
import {
  RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY,
  RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE,
  type RrmSimReadonlySummaryPayloadV1,
} from "../src/modules/matching/matching-rrm-sim-readonly-summary";
import * as writerMod from "../src/modules/matching/matching-rrm-top2-display-meta-writer";
import type { WriteRrmTop2DisplayMetaForMatchResultPrisma } from "../src/modules/matching/matching-rrm-top2-display-meta-writer";
import {
  extractStaticTop2FromHookSnapshot,
  processRrmTop2HookJobDryRun,
  tryParseHookJobGuardrails,
} from "../src/modules/matching/rrm-top2-hook-job-consumer";
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
    sourceVersion: "m5.6-b4-hook-consumer-v1",
    status: RRM_TOP2_HOOK_JOB_STATUS.PENDING,
    staticTop2Snapshot: {
      kind: "rrm_top2_static_snapshot_v1",
      candidateUserIds: ["cand-a", "cand-b"],
      top2Fingerprint: "fp1",
      source: "controlled_runner",
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
  sidecar?: { frozen: boolean; meta: unknown } | null;
  upsert?: jest.Mock;
  update?: jest.Mock;
  userIds?: Set<string>;
}): WriteRrmTop2DisplayMetaForMatchResultPrisma {
  const userIds = over.userIds ?? new Set(["cand-a", "cand-b"]);
  const row = over.row === undefined ? mr() : over.row;
  return {
    matchResult: {
      findUnique: jest.fn(async () => row),
      update: over.update ?? jest.fn(async () => ({})),
    },
    matchResultRrmTop2DisplayMeta: {
      findUnique: jest.fn(async () => over.sidecar ?? null),
      upsert: over.upsert ?? jest.fn(async () => ({})),
    },
    user: {
      findUnique: jest.fn(async ({ where: { id } }) => (userIds.has(id) ? { id } : null)),
    },
  };
}

describe("rrm-top2-hook-job-consumer (M5.6-B4)", () => {
  let writerSpy: jest.SpiedFunction<typeof writerMod.writeRrmTop2DisplayMetaForMatchResult>;

  beforeAll(() => {
    writerSpy = jest.spyOn(writerMod, "writeRrmTop2DisplayMetaForMatchResult");
  });

  beforeEach(() => {
    writerSpy.mockClear();
  });

  afterAll(() => {
    writerSpy.mockRestore();
  });

  it("valid job + writer dry-run ok → wouldProcess", async () => {
    const p = prismaFactory({});
    const r = await processRrmTop2HookJobDryRun({ prisma: p, job: baseJob() });
    expect(r.wouldProcess).toBe(true);
    expect(r.wouldSkip).toBe(false);
    expect(r.noOpReasonCode).toBeNull();
    expect(r.writerResult?.ok).toBe(true);
    expect(r.writerResult?.dryRun).toBe(true);
    expect(r.candidateUserIdUnchanged).toBe(true);
    expect(r.finalScoreUnchanged).toBe(true);
  });

  it("missing staticTop2Snapshot → wouldSkip static_top2_missing", async () => {
    const p = prismaFactory({});
    const r = await processRrmTop2HookJobDryRun({
      prisma: p,
      job: baseJob({ staticTop2Snapshot: null }),
    });
    expect(r.wouldSkip).toBe(true);
    expect(r.noOpReasonCode).toBe("static_top2_missing");
    expect(writerSpy).not.toHaveBeenCalled();
  });

  it("duplicate top2 → wouldSkip top2_duplicate", async () => {
    const p = prismaFactory({});
    const r = await processRrmTop2HookJobDryRun({
      prisma: p,
      job: baseJob({
        staticTop2Snapshot: { candidateUserIds: ["cand-a", "cand-a"] },
      }),
    });
    expect(r.wouldSkip).toBe(true);
    expect(r.noOpReasonCode).toBe("top2_duplicate");
    expect(writerSpy).not.toHaveBeenCalled();
  });

  it("missing guardrails → wouldSkip guardrails_missing", async () => {
    const p = prismaFactory({});
    const r = await processRrmTop2HookJobDryRun({
      prisma: p,
      job: baseJob({ guardrails: null }),
    });
    expect(r.wouldSkip).toBe(true);
    expect(r.noOpReasonCode).toBe("guardrails_missing");
    expect(writerSpy).not.toHaveBeenCalled();
  });

  it("guardrails caution → writer dry-run no-op (guardrails_invalid)", async () => {
    const p = prismaFactory({});
    const r = await processRrmTop2HookJobDryRun({
      prisma: p,
      job: baseJob({
        guardrails: {
          status: "caution",
          blockReasons: [],
          cautionReasons: ["x"],
          sourceVersion: "g-v1",
        },
      }),
    });
    expect(r.wouldSkip).toBe(true);
    expect(r.noOpReasonCode).toBe("guardrails_invalid");
    expect(r.writerResult?.ok).toBe(false);
    expect(writerSpy).toHaveBeenCalled();
  });

  it("guardrails block → writer dry-run no-op", async () => {
    const p = prismaFactory({});
    const r = await processRrmTop2HookJobDryRun({
      prisma: p,
      job: baseJob({
        guardrails: {
          status: "block",
          blockReasons: ["b"],
          cautionReasons: [],
        },
      }),
    });
    expect(r.wouldSkip).toBe(true);
    expect(r.noOpReasonCode).toBe("guardrails_invalid");
  });

  it("guardrails not_evaluated → writer dry-run no-op", async () => {
    const p = prismaFactory({});
    const r = await processRrmTop2HookJobDryRun({
      prisma: p,
      job: baseJob({
        guardrails: {
          status: "not_evaluated",
          blockReasons: [],
          cautionReasons: [],
        },
      }),
    });
    expect(r.wouldSkip).toBe(true);
    expect(r.noOpReasonCode).toBe("guardrails_invalid");
  });

  it("missing summary with pass guardrails → wouldSkip rrm_summary_missing (no writer)", async () => {
    const p = prismaFactory({ row: mr({ matchInsights: {} }) });
    const mockWriter = jest.fn();
    const r = await processRrmTop2HookJobDryRun({
      prisma: p,
      job: baseJob(),
      writeRrmTop2DisplayMetaForMatchResultFn: mockWriter as typeof writerMod.writeRrmTop2DisplayMetaForMatchResult,
    });
    expect(r.wouldSkip).toBe(true);
    expect(r.noOpReasonCode).toBe("rrm_summary_missing");
    expect(mockWriter).not.toHaveBeenCalled();
  });

  it("calls writer with dryRun=true and summaryWriteEnabled=false", async () => {
    const p = prismaFactory({});
    await processRrmTop2HookJobDryRun({ prisma: p, job: baseJob() });
    expect(writerSpy).toHaveBeenCalledTimes(1);
    const arg = writerSpy.mock.calls[0][0];
    expect(arg.dryRun).toBe(true);
    expect(arg.summaryWriteEnabled).toBe(false);
    expect(arg.metaWriteEnabled).toBe(true);
  });

  it("never calls matchResult.update", async () => {
    const update = jest.fn();
    const p = prismaFactory({ update });
    await processRrmTop2HookJobDryRun({ prisma: p, job: baseJob() });
    expect(update).not.toHaveBeenCalled();
  });

  it("never calls matchResultRrmTop2DisplayMeta.upsert", async () => {
    const upsert = jest.fn();
    const p = prismaFactory({ upsert });
    await processRrmTop2HookJobDryRun({ prisma: p, job: baseJob() });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("extractStaticTop2FromHookSnapshot: wrong shape → top2_invalid", () => {
    const ex = extractStaticTop2FromHookSnapshot({ candidateUserIds: ["only-one"] });
    expect(ex.ok).toBe(false);
    if (!ex.ok) expect(ex.reason).toBe("top2_invalid");
  });

  it("tryParseHookJobGuardrails parses pass", () => {
    const g = tryParseHookJobGuardrails({ status: "pass", blockReasons: [], cautionReasons: [] });
    expect(g?.status).toBe("pass");
  });
});
