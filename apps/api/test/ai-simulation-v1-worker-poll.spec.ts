import * as jobExec from "../../../packages/ai-simulation-v1-runner/src/run-ai-simulation-v1-job-execution";
import {
  registerAiSimulationV1QueueWorker,
  runAiSimulationV1WorkerPollOnce,
} from "../../../packages/ai-simulation-v1-runner/src/worker-consumer";

describe("runAiSimulationV1WorkerPollOnce (M3.3-M1)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("claim success calls runAiSimulationV1JobExecution once", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findFirst: jest.fn().mockResolvedValue({ id: "job1", viewerUserId: "v1" }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const spy = jest.spyOn(jobExec, "runAiSimulationV1JobExecution").mockResolvedValue(undefined);

    await runAiSimulationV1WorkerPollOnce(prisma as never);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma,
        completeChat: expect.any(Function),
        getProfileForUser: expect.any(Function),
      }),
      { jobId: "job1", viewerUserId: "v1" },
    );
  });

  it("claim lost does not call runAiSimulationV1JobExecution", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findFirst: jest.fn().mockResolvedValue({ id: "job1", viewerUserId: "v1" }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const spy = jest.spyOn(jobExec, "runAiSimulationV1JobExecution");

    await runAiSimulationV1WorkerPollOnce(prisma as never);

    expect(spy).not.toHaveBeenCalled();
  });

  it("no queued job does not call runner", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const spy = jest.spyOn(jobExec, "runAiSimulationV1JobExecution");

    await runAiSimulationV1WorkerPollOnce(prisma as never);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("registerAiSimulationV1QueueWorker", () => {
  it("logs disabled when AI_SIMULATION_V1_WORKER_ENABLED is off", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation();
    const prevE = process.env.AI_SIMULATION_V1_ENABLED;
    const prevW = process.env.AI_SIMULATION_V1_WORKER_ENABLED;
    process.env.AI_SIMULATION_V1_ENABLED = "1";
    process.env.AI_SIMULATION_V1_WORKER_ENABLED = "0";
    registerAiSimulationV1QueueWorker();
    expect(
      logSpy.mock.calls.some((c) => String(c[0]).includes("ai_simulation_v1_worker_disabled")),
    ).toBe(true);
    logSpy.mockRestore();
    if (prevE === undefined) delete process.env.AI_SIMULATION_V1_ENABLED;
    else process.env.AI_SIMULATION_V1_ENABLED = prevE;
    if (prevW === undefined) delete process.env.AI_SIMULATION_V1_WORKER_ENABLED;
    else process.env.AI_SIMULATION_V1_WORKER_ENABLED = prevW;
  });
});
