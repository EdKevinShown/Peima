import type { PrismaService } from "../src/common/prisma/prisma.service";
import * as hookJobService from "../src/modules/matching/rrm-top2-hook-job.service";
import type { M56B3HookOutput } from "../src/dev-cli/m56-b3-rrm-top2-hook-job-runner";
import {
  buildM56B3StaticTop2Snapshot,
  formatM56B3HookJobOutput,
  guardrailsFromM56B3CliStatus,
  M56_B3_HOOK_JOB_RUNNER_DEFAULT_SOURCE_VERSION,
  parseM56B3HookJobArgs,
  runM56B3HookJobRunner,
} from "../src/dev-cli/m56-b3-rrm-top2-hook-job-runner";
import type { RrmTop2HookJobRow } from "../src/modules/matching/rrm-top2-hook-job.types";
import { RRM_TOP2_HOOK_JOB_STATUS } from "../src/modules/matching/rrm-top2-hook-job.types";

function baseOpts(over: Partial<ReturnType<typeof parseM56B3HookJobArgs> & object> = {}): NonNullable<ReturnType<typeof parseM56B3HookJobArgs>> {
  return {
    matchResultId: "mr-local-1",
    viewerUserId: "viewer-local-1",
    top2CandidateUserIdA: "cand-a",
    top2CandidateUserIdB: "cand-b",
    top2Fingerprint: "fp-local-1",
    sourceVersion: M56_B3_HOOK_JOB_RUNNER_DEFAULT_SOURCE_VERSION,
    rrmSourceType: "controlled_runner",
    rrmSourceId: null,
    rrmSummarySourceVersion: null,
    guardrailsStatus: "pass",
    poolId: null,
    batchId: null,
    aiSimulationJobId: null,
    pairwiseJobId: null,
    apply: false,
    pretty: false,
    ...over,
  } as NonNullable<ReturnType<typeof parseM56B3HookJobArgs>>;
}

describe("m56-b3-rrm-top2-hook-job-runner", () => {
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    jest.restoreAllMocks();
  });

  it("refuses when NODE_ENV is production", async () => {
    process.env.NODE_ENV = "production";
    const r = await runM56B3HookJobRunner(baseOpts(), null);
    expect(r).toEqual({ refused: true, reason: "node_env_production" });
  });

  it("parseM56B3HookJobArgs returns null when required args missing", () => {
    expect(parseM56B3HookJobArgs([])).toBeNull();
    expect(
      parseM56B3HookJobArgs([
        "--matchResultId=x",
        "--viewerUserId=y",
        "--top2CandidateUserIdA=a",
        "--top2CandidateUserIdB=b",
      ]),
    ).toBeNull();
  });

  it("rejects duplicate top2 candidates with preflightError", async () => {
    process.env.NODE_ENV = "development";
    const o = baseOpts({ top2CandidateUserIdB: "cand-a" });
    const r = await runM56B3HookJobRunner(o, null);
    expect("refused" in r && r.refused).toBe(false);
    if ("refused" in r && r.refused) return;
    const out = r as M56B3HookOutput;
    expect(out.preflightError).toBe("top2_duplicate");
  });

  it("dry-run does not call createOrGetRrmTop2HookJob", async () => {
    process.env.NODE_ENV = "development";
    const spy = jest.spyOn(hookJobService, "createOrGetRrmTop2HookJob");
    const r = await runM56B3HookJobRunner(baseOpts({ apply: false }), null);
    expect(spy).not.toHaveBeenCalled();
    if (!("refused" in r && r.refused)) {
      const out = r as M56B3HookOutput;
      expect(out.created).toBeNull();
      expect(out.dryRun).toBe(true);
    }
    spy.mockRestore();
  });

  it("apply calls createOrGetRrmTop2HookJob", async () => {
    process.env.NODE_ENV = "development";
    const job: RrmTop2HookJobRow = {
      id: "job-1",
      matchResultId: "mr-local-1",
      viewerUserId: "viewer-local-1",
      sourceVersion: M56_B3_HOOK_JOB_RUNNER_DEFAULT_SOURCE_VERSION,
      status: RRM_TOP2_HOOK_JOB_STATUS.PENDING,
      staticTop2Snapshot: {},
      top2Fingerprint: "fp-local-1",
      rrmSourceType: "controlled_runner",
      rrmSourceId: null,
      rrmSummarySourceVersion: null,
      guardrails: {},
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const matchResultUpdate = jest.fn();
    const metaUpsert = jest.fn();
    const prisma = {
      matchResult: { update: matchResultUpdate },
      matchResultRrmTop2DisplayMeta: { upsert: metaUpsert },
      matchResultRrmTop2DisplayHookJob: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService;

    const spy = jest.spyOn(hookJobService, "createOrGetRrmTop2HookJob").mockImplementation(async (input) => {
      void input;
      return { job, created: true };
    });

    const r = await runM56B3HookJobRunner(baseOpts({ apply: true }), prisma);
    expect(spy).toHaveBeenCalledTimes(1);
    if (!("refused" in r && r.refused)) {
      const out = r as M56B3HookOutput;
      expect(out.created).toBe(true);
      expect(out.jobId).toBe("job-1");
    }
    expect(matchResultUpdate).not.toHaveBeenCalled();
    expect(metaUpsert).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("apply duplicate returns created=false from createOrGet", async () => {
    process.env.NODE_ENV = "development";
    const job = {
      id: "job-existing",
      matchResultId: "mr-local-1",
      viewerUserId: "viewer-local-1",
      sourceVersion: M56_B3_HOOK_JOB_RUNNER_DEFAULT_SOURCE_VERSION,
      status: RRM_TOP2_HOOK_JOB_STATUS.PENDING,
      staticTop2Snapshot: {},
      top2Fingerprint: "fp-local-1",
      rrmSourceType: "controlled_runner",
      rrmSourceId: null,
      rrmSummarySourceVersion: null,
      guardrails: {},
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
      createdAt: new Date(),
      updatedAt: new Date(),
    } as RrmTop2HookJobRow;

    const spy = jest.spyOn(hookJobService, "createOrGetRrmTop2HookJob").mockResolvedValue({ job, created: false });
    const prisma = {
      matchResult: { update: jest.fn() },
      matchResultRrmTop2DisplayMeta: { upsert: jest.fn() },
      matchResultRrmTop2DisplayHookJob: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService;

    const r = await runM56B3HookJobRunner(baseOpts({ apply: true }), prisma);
    if (!("refused" in r && r.refused)) {
      const out = r as M56B3HookOutput;
      expect(out.created).toBe(false);
    }
    spy.mockRestore();
  });

  it("guardrailsFromM56B3CliStatus pass", () => {
    const g = guardrailsFromM56B3CliStatus("pass");
    expect(g.status).toBe("pass");
    expect(g.blockReasons).toEqual([]);
    expect(g.cautionReasons).toEqual([]);
  });

  it("guardrailsFromM56B3CliStatus caution / block / not_evaluated", () => {
    expect(guardrailsFromM56B3CliStatus("caution").status).toBe("caution");
    expect(guardrailsFromM56B3CliStatus("block").status).toBe("block");
    expect(guardrailsFromM56B3CliStatus("not_evaluated").status).toBe("not_evaluated");
  });

  it("dry-run JSON output avoids common secret-shaped substrings in fixed fields", async () => {
    process.env.NODE_ENV = "development";
    const r = await runM56B3HookJobRunner(baseOpts(), null);
    if ("refused" in r && r.refused) {
      throw new Error("unexpected refused");
    }
    const s = formatM56B3HookJobOutput(r, false);
    expect(s).not.toMatch(/Bearer\s+\S+/i);
    expect(s).not.toContain("DATABASE_URL=");
    expect(s).not.toContain("postgres://");
  });

  it("buildM56B3StaticTop2Snapshot shape", () => {
    const snap = buildM56B3StaticTop2Snapshot(" u1 ", " u2 ", " fp ");
    expect(snap.kind).toBe("rrm_top2_static_snapshot_v1");
    expect(snap.candidateUserIds).toEqual(["u1", "u2"]);
    expect(snap.top2Fingerprint).toBe("fp");
  });
});
