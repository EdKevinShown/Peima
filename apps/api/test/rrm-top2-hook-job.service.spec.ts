import {
  createOrGetRrmTop2HookJob,
  findPendingRrmTop2HookJobs,
  markRrmTop2HookJobFailed,
  markRrmTop2HookJobProcessed,
  markRrmTop2HookJobProcessing,
  markRrmTop2HookJobSkipped,
  sanitizeRrmTop2HookJobError,
  type RrmTop2HookJobPrisma,
} from "../src/modules/matching/rrm-top2-hook-job.service";
import {
  RRM_TOP2_HOOK_JOB_CONTRACT_SOURCE_VERSION,
  RRM_TOP2_HOOK_JOB_STATUS,
  type RrmTop2HookJobRow,
} from "../src/modules/matching/rrm-top2-hook-job.types";

function baseJob(over: Partial<RrmTop2HookJobRow> = {}): RrmTop2HookJobRow {
  const now = new Date();
  return {
    id: "job-hook-1",
    matchResultId: "mr-local-1",
    viewerUserId: "viewer-local-1",
    sourceVersion: RRM_TOP2_HOOK_JOB_CONTRACT_SOURCE_VERSION,
    status: RRM_TOP2_HOOK_JOB_STATUS.PENDING,
    staticTop2Snapshot: { top2: ["a", "b"] },
    top2Fingerprint: "fp-local-1",
    rrmSourceType: "test",
    rrmSourceId: null,
    rrmSummarySourceVersion: null,
    guardrails: { status: "pass", blockReasons: [], cautionReasons: [] },
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

describe("rrm-top2-hook-job.service (M5.6-B2)", () => {
  const matchResultUpdate = jest.fn();
  const metaUpsert = jest.fn();

  function asServicePrisma(p: RrmTop2HookJobPrisma): RrmTop2HookJobPrisma {
    Object.assign(p as Record<string, unknown>, {
      matchResult: { update: matchResultUpdate },
      matchResultRrmTop2DisplayMeta: { upsert: metaUpsert },
    });
    return p;
  }

  beforeEach(() => {
    matchResultUpdate.mockReset();
    metaUpsert.mockReset();
  });

  it("createOrGetRrmTop2HookJob creates pending row when absent", async () => {
    const createdRow = baseJob({ id: "new-id" });
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue(createdRow);
    const prisma = asServicePrisma({
      matchResultRrmTop2DisplayHookJob: { findUnique, create, findMany: jest.fn(), update: jest.fn() },
    });
    const r = await createOrGetRrmTop2HookJob({
      prisma,
      matchResultId: "mr-local-1",
      viewerUserId: "viewer-local-1",
      sourceVersion: RRM_TOP2_HOOK_JOB_CONTRACT_SOURCE_VERSION,
      staticTop2Snapshot: { a: 1 },
      top2Fingerprint: "fp-local-1",
      rrmSourceType: "pairwise_job",
      guardrails: { status: "pass", blockReasons: [], cautionReasons: [] },
    });
    expect(r.created).toBe(true);
    expect(r.job.id).toBe("new-id");
    expect(create).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        matchResultId_top2Fingerprint_sourceVersion: {
          matchResultId: "mr-local-1",
          top2Fingerprint: "fp-local-1",
          sourceVersion: RRM_TOP2_HOOK_JOB_CONTRACT_SOURCE_VERSION,
        },
      },
    });
    expect(matchResultUpdate).not.toHaveBeenCalled();
    expect(metaUpsert).not.toHaveBeenCalled();
  });

  it("createOrGetRrmTop2HookJob returns existing when unique matches", async () => {
    const existing = baseJob();
    const findUnique = jest.fn().mockResolvedValue(existing);
    const create = jest.fn();
    const prisma = asServicePrisma({
      matchResultRrmTop2DisplayHookJob: { findUnique, create, findMany: jest.fn(), update: jest.fn() },
    });
    const r = await createOrGetRrmTop2HookJob({
      prisma,
      matchResultId: "mr-local-1",
      viewerUserId: "viewer-local-1",
      sourceVersion: RRM_TOP2_HOOK_JOB_CONTRACT_SOURCE_VERSION,
      staticTop2Snapshot: {},
      top2Fingerprint: "fp-local-1",
      rrmSourceType: "pairwise_job",
      guardrails: {},
    });
    expect(r.created).toBe(false);
    expect(r.job).toBe(existing);
    expect(create).not.toHaveBeenCalled();
    expect(matchResultUpdate).not.toHaveBeenCalled();
    expect(metaUpsert).not.toHaveBeenCalled();
  });

  it("findPendingRrmTop2HookJobs filters pending, orders asc, clamps limit", async () => {
    const findMany = jest.fn().mockResolvedValue([baseJob()]);
    const prisma = asServicePrisma({
      matchResultRrmTop2DisplayHookJob: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany,
        update: jest.fn(),
      },
    });
    await findPendingRrmTop2HookJobs({ prisma, limit: 500 });
    expect(findMany).toHaveBeenCalledWith({
      where: { status: RRM_TOP2_HOOK_JOB_STATUS.PENDING },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    findMany.mockClear();
    await findPendingRrmTop2HookJobs({ prisma });
    expect(findMany).toHaveBeenCalledWith({
      where: { status: RRM_TOP2_HOOK_JOB_STATUS.PENDING },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    expect(matchResultUpdate).not.toHaveBeenCalled();
  });

  it("markRrmTop2HookJobProcessing sets processing, lockedAt, increments attempts", async () => {
    const t = new Date("2026-05-03T12:00:00.000Z");
    const update = jest.fn().mockResolvedValue(baseJob({ status: RRM_TOP2_HOOK_JOB_STATUS.PROCESSING, attempts: 1, lockedAt: t }));
    const prisma = asServicePrisma({
      matchResultRrmTop2DisplayHookJob: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update,
      },
    });
    await markRrmTop2HookJobProcessing({ prisma, jobId: "job-hook-1", now: t });
    expect(update).toHaveBeenCalledWith({
      where: { id: "job-hook-1" },
      data: {
        status: RRM_TOP2_HOOK_JOB_STATUS.PROCESSING,
        lockedAt: t,
        attempts: { increment: 1 },
      },
    });
    expect(matchResultUpdate).not.toHaveBeenCalled();
  });

  it("markRrmTop2HookJobProcessed sets processedAt and clears noOp + lockedAt", async () => {
    const t = new Date("2026-05-03T12:01:00.000Z");
    const update = jest.fn().mockResolvedValue(baseJob({ status: RRM_TOP2_HOOK_JOB_STATUS.PROCESSED }));
    const prisma = asServicePrisma({
      matchResultRrmTop2DisplayHookJob: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), update },
    });
    await markRrmTop2HookJobProcessed({
      prisma,
      jobId: "job-hook-1",
      now: t,
      metaWriteResult: { ok: true },
    });
    expect(update.mock.calls[0][0].data).toMatchObject({
      status: RRM_TOP2_HOOK_JOB_STATUS.PROCESSED,
      processedAt: t,
      noOpReasonCode: null,
      metaWriteResult: { ok: true },
      lastErrorCode: null,
      lastErrorMessage: null,
      lockedAt: null,
    });
  });

  it("markRrmTop2HookJobSkipped stores noOpReasonCode and processedAt", async () => {
    const t = new Date("2026-05-03T12:02:00.000Z");
    const update = jest.fn().mockResolvedValue(baseJob({ status: RRM_TOP2_HOOK_JOB_STATUS.SKIPPED }));
    const prisma = asServicePrisma({
      matchResultRrmTop2DisplayHookJob: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), update },
    });
    await markRrmTop2HookJobSkipped({
      prisma,
      jobId: "job-hook-1",
      noOpReasonCode: "writer_disabled",
      now: t,
    });
    expect(update.mock.calls[0][0].data).toMatchObject({
      status: RRM_TOP2_HOOK_JOB_STATUS.SKIPPED,
      processedAt: t,
      noOpReasonCode: "writer_disabled",
      lockedAt: null,
    });
  });

  it("markRrmTop2HookJobFailed stores sanitized message and clears lease / processedAt", async () => {
    const update = jest.fn().mockResolvedValue(baseJob({ status: RRM_TOP2_HOOK_JOB_STATUS.FAILED }));
    const prisma = asServicePrisma({
      matchResultRrmTop2DisplayHookJob: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), update },
    });
    const err = new Error('fail Bearer secret-token DATABASE_URL=postgres://u:p@host/db');
    await markRrmTop2HookJobFailed({ prisma, jobId: "job-hook-1", lastErrorCode: "db_error", error: err });
    const arg = update.mock.calls[0][0];
    expect(arg.data.status).toBe(RRM_TOP2_HOOK_JOB_STATUS.FAILED);
    expect(arg.data.lastErrorCode).toBe("db_error");
    expect(String(arg.data.lastErrorMessage)).toContain("[REDACTED_BEARER]");
    expect(String(arg.data.lastErrorMessage)).toContain("[REDACTED_DATABASE_URL]");
    expect(arg.data.processedAt).toBeNull();
    expect(arg.data.lockedAt).toBeNull();
  });

  it("sanitizeRrmTop2HookJobError returns null for null/undefined and caps length", () => {
    expect(sanitizeRrmTop2HookJobError(null)).toBeNull();
    expect(sanitizeRrmTop2HookJobError(undefined)).toBeNull();
    const long = "x".repeat(600);
    const out = sanitizeRrmTop2HookJobError(long);
    expect(out!.length).toBeLessThanOrEqual(500);
  });
});
