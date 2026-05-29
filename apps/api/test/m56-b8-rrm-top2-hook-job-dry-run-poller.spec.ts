import * as applySvc from "../src/modules/matching/rrm-top2-hook-job-apply.service";
import type { RrmTop2HookJobApplyPrisma } from "../src/modules/matching/rrm-top2-hook-job-apply.service";
import * as hookJobSvc from "../src/modules/matching/rrm-top2-hook-job.service";
import * as metaWriter from "../src/modules/matching/matching-rrm-top2-display-meta-writer";
import {
  formatM56B8PollerOutput,
  M56_B8_POLLER_SOURCE_VERSION,
  parseM56B8PollerArgs,
  runM56B8HookJobDryRunPoller,
} from "../src/dev-cli/m56-b8-rrm-top2-hook-job-dry-run-poller";
import { processRrmTop2HookJobDryRun } from "../src/modules/matching/rrm-top2-hook-job-consumer";
import { RRM_TOP2_HOOK_JOB_STATUS, type RrmTop2HookJobRow } from "../src/modules/matching/rrm-top2-hook-job.types";
import type { RrmTop2DisplayMetaGuardrailsV1 } from "../src/modules/matching/rrm-top2-display-meta.types";

function passGr(): RrmTop2DisplayMetaGuardrailsV1 {
  return {
    status: "pass",
    blockReasons: [],
    cautionReasons: [],
    sourceVersion: "m5-test-guardrails-v1",
  };
}

function baseJob(over: Partial<RrmTop2HookJobRow> = {}): RrmTop2HookJobRow {
  const now = new Date();
  return {
    id: "job-hook-test-1",
    matchResultId: "mr-test-1",
    viewerUserId: "viewer-test-1",
    sourceVersion: "m5.6-b8-test-v1",
    status: RRM_TOP2_HOOK_JOB_STATUS.PENDING,
    staticTop2Snapshot: {
      kind: "rrm_top2_static_snapshot_v1",
      candidateUserIds: ["cand-x", "cand-y"],
      top2Fingerprint: "fp-test",
      source: "test",
    },
    top2Fingerprint: "fp-test",
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

function prismaFactory(): RrmTop2HookJobApplyPrisma {
  const matchUpdate = jest.fn(async () => ({}));
  const metaUpsert = jest.fn(async () => ({}));
  return {
    matchResultRrmTop2DisplayHookJob: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    matchResult: {
      findUnique: jest.fn(async () => null),
      update: matchUpdate,
    },
    matchResultRrmTop2DisplayMeta: {
      findUnique: jest.fn(async () => null),
      upsert: metaUpsert,
    },
    user: {
      findUnique: jest.fn(async () => null),
    },
  } as unknown as RrmTop2HookJobApplyPrisma;
}

describe("m56-b8-rrm-top2-hook-job-dry-run-poller (M5.6-B8-B)", () => {
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("production env refuses", async () => {
    process.env.NODE_ENV = "production";
    const p = prismaFactory();
    const r = await runM56B8HookJobDryRunPoller(p, { limit: 5, pretty: false, once: true });
    expect(r).toEqual({ refused: true, reason: "node_env_production" });
  });

  it("parse rejects --apply", () => {
    expect(parseM56B8PollerArgs(["--apply"])).toEqual({ ok: false, reason: "apply_not_supported" });
    expect(parseM56B8PollerArgs(["--apply=1"])).toEqual({ ok: false, reason: "apply_not_supported" });
  });

  it("parse rejects --mode=apply", () => {
    expect(parseM56B8PollerArgs(["--mode=apply"])).toEqual({ ok: false, reason: "apply_mode_not_supported" });
    expect(parseM56B8PollerArgs(["--mode=Apply"])).toEqual({ ok: false, reason: "apply_mode_not_supported" });
  });

  it("parse rejects --confirmControlledApply (apply-semantic)", () => {
    expect(parseM56B8PollerArgs(["--confirmControlledApply=I_UNDERSTAND"])).toEqual({
      ok: false,
      reason: "apply_semantic_flag_not_supported",
    });
  });

  it("parse: default limit 5, max 10", () => {
    expect(parseM56B8PollerArgs([])).toEqual({
      ok: true,
      opts: { limit: 5, pretty: false, once: true },
    });
    expect(parseM56B8PollerArgs(["--limit=0"])).toMatchObject({ ok: true, opts: { limit: 1 } });
    expect(parseM56B8PollerArgs(["--limit=99"])).toMatchObject({ ok: true, opts: { limit: 10 } });
  });

  it("parse: default once=true in opts", () => {
    const r = parseM56B8PollerArgs(["--once", "--pretty"]);
    expect(r).toEqual({ ok: true, opts: { limit: 5, pretty: true, once: true } });
  });

  it("calls processRrmTop2HookJobsDryRunAggregate", async () => {
    process.env.NODE_ENV = "test";
    const spy = jest.spyOn(applySvc, "processRrmTop2HookJobsDryRunAggregate").mockResolvedValue({
      refused: false,
      mode: "dry_run",
      apply: false,
      sourceVersion: M56_B8_POLLER_SOURCE_VERSION,
      totalJobsRead: 0,
      wouldProcessCount: 0,
      wouldSkipCount: 0,
      noOpReasonCounts: {},
      writerOkCount: 0,
      writerNoOpCount: 0,
      candidateUserIdUnchangedAll: true,
      finalScoreUnchangedAll: true,
      items: [],
    });
    const p = prismaFactory();
    await runM56B8HookJobDryRunPoller(p, { limit: 3, pretty: false, once: true });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma: p,
        limit: 3,
        sourceVersion: M56_B8_POLLER_SOURCE_VERSION,
      }),
    );
    spy.mockRestore();
  });

  it("ok output includes once=true and poller sourceVersion", async () => {
    process.env.NODE_ENV = "test";
    const job = baseJob();
    const p = prismaFactory();
    const r = await runM56B8HookJobDryRunPoller(p, { limit: 5, pretty: false, once: true }, {
      findPendingRrmTop2HookJobs: async () => [job],
      processRrmTop2HookJobDryRun,
    });
    if ("refused" in r && r.refused) throw new Error("unexpected refused");
    expect(r.once).toBe(true);
    expect(r.sourceVersion).toBe(M56_B8_POLLER_SOURCE_VERSION);
    expect(r.mode).toBe("dry_run");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toEqual(
      expect.objectContaining({
        index: 0,
        wouldProcess: expect.any(Boolean),
        wouldSkip: expect.any(Boolean),
        noOpReasonCode: expect.anything(),
      }),
    );
    expect(r.items[0]).not.toHaveProperty("matchResultId");
    expect(r.items[0]).not.toHaveProperty("id");
  });

  it("does not call markRrmTop2HookJobProcessing", async () => {
    process.env.NODE_ENV = "test";
    const markP = jest.spyOn(hookJobSvc, "markRrmTop2HookJobProcessing");
    const p = prismaFactory();
    await runM56B8HookJobDryRunPoller(p, { limit: 5, pretty: false, once: true }, {
      findPendingRrmTop2HookJobs: async () => [baseJob()],
      processRrmTop2HookJobDryRun,
    });
    expect(markP).not.toHaveBeenCalled();
    markP.mockRestore();
  });

  it("never calls writer with dryRun=false (no apply path)", async () => {
    process.env.NODE_ENV = "test";
    const writerSpy = jest.spyOn(metaWriter, "writeRrmTop2DisplayMetaForMatchResult");
    const p = prismaFactory();
    await runM56B8HookJobDryRunPoller(p, { limit: 5, pretty: false, once: true }, {
      findPendingRrmTop2HookJobs: async () => [baseJob()],
      processRrmTop2HookJobDryRun,
    });
    for (const call of writerSpy.mock.calls) {
      expect((call[0] as { dryRun?: boolean }).dryRun).toBe(true);
    }
    writerSpy.mockRestore();
  });

  it("does not call matchResult.update or meta upsert", async () => {
    process.env.NODE_ENV = "test";
    const p = prismaFactory();
    await runM56B8HookJobDryRunPoller(p, { limit: 5, pretty: false, once: true }, {
      findPendingRrmTop2HookJobs: async () => [baseJob()],
      processRrmTop2HookJobDryRun,
    });
    expect(p.matchResult.update).not.toHaveBeenCalled();
    expect(p.matchResultRrmTop2DisplayMeta.upsert).not.toHaveBeenCalled();
  });

  it("serialized ok JSON omits DATABASE_URL and postgres URL and common secret patterns", async () => {
    process.env.NODE_ENV = "test";
    const prevDb = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://user:secret@host:5432/db";
    try {
      const p = prismaFactory();
      const r = await runM56B8HookJobDryRunPoller(p, { limit: 5, pretty: false, once: true }, {
        findPendingRrmTop2HookJobs: async () => [],
        processRrmTop2HookJobDryRun,
      });
      const s = JSON.stringify(r);
      expect(s).not.toMatch(/DATABASE_URL/i);
      expect(s).not.toMatch(/postgres:\/\//i);
      expect(s).not.toMatch(/secret@/i);
      expect(s).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    } finally {
      process.env.DATABASE_URL = prevDb;
    }
  });

  it("formatM56B8PollerOutput for parse failure is aggregate-safe", () => {
    const s = formatM56B8PollerOutput({ ok: false, reason: "apply_not_supported" }, false);
    expect(JSON.parse(s.trim())).toEqual({ refused: true, reason: "apply_not_supported" });
  });
});
