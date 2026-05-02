import { recoverStuckAiSimulationV1JobsOnce } from "../../../packages/ai-simulation-v1-runner/src/worker-consumer";

describe("recoverStuckAiSimulationV1JobsOnce (M3.3-M2)", () => {
  const now = new Date("2026-01-15T12:00:00.000Z");
  const cutoff = new Date(now.getTime() - 900_000);
  const stuckTimeoutMs = 900_000;

  it("does not recover when no stuck running jobs", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    };

    await recoverStuckAiSimulationV1JobsOnce(prisma as never, { now, stuckTimeoutMs });

    expect(prisma.aiSimulationV1Job.findMany).toHaveBeenCalledWith({
      where: {
        jobStatus: "running",
        updatedAt: { lt: cutoff },
      },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("recovers stuck job: job running→queued and running items→queued", async () => {
    const jobUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const itemUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      aiSimulationV1Job: {
        findMany: jest.fn().mockResolvedValue([{ id: "job-stuck" }]),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          aiSimulationV1Job: { updateMany: jobUpdateMany },
          aiSimulationV1Item: { updateMany: itemUpdateMany },
        };
        return fn(tx);
      }),
    };

    await recoverStuckAiSimulationV1JobsOnce(prisma as never, { now, stuckTimeoutMs });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(jobUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "job-stuck",
        jobStatus: "running",
        updatedAt: { lt: cutoff },
      },
      data: { jobStatus: "queued" },
    });
    expect(itemUpdateMany).toHaveBeenCalledWith({
      where: { jobId: "job-stuck", status: "running" },
      data: { status: "queued" },
    });
  });

  it("skips transaction item reset when job update loses race (count 0)", async () => {
    const jobUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const itemUpdateMany = jest.fn();
    const prisma = {
      aiSimulationV1Job: {
        findMany: jest.fn().mockResolvedValue([{ id: "job-x" }]),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          aiSimulationV1Job: { updateMany: jobUpdateMany },
          aiSimulationV1Item: { updateMany: itemUpdateMany },
        };
        return fn(tx);
      }),
    };

    await recoverStuckAiSimulationV1JobsOnce(prisma as never, { now, stuckTimeoutMs });

    expect(jobUpdateMany).toHaveBeenCalled();
    expect(itemUpdateMany).not.toHaveBeenCalled();
  });

  it("findMany only targets running + stale updatedAt (not completed / not fresh queued)", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    };

    await recoverStuckAiSimulationV1JobsOnce(prisma as never, { now, stuckTimeoutMs });

    const call = prisma.aiSimulationV1Job.findMany.mock.calls[0][0];
    expect(call.where.jobStatus).toBe("running");
    expect(call.where.updatedAt).toEqual({ lt: cutoff });
  });
});
