import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import * as aiSimRunner from "@peima/ai-simulation-v1-runner";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { QuestionnaireService } from "../src/modules/questionnaire/questionnaire.service";
import { AiSimulationV1ChatClient } from "../src/modules/ai-simulation-v1/ai-simulation-v1-chat.client";
import { AiSimulationV1ConfigService } from "../src/modules/ai-simulation-v1/ai-simulation-v1.config.service";
import { AiSimulationV1Service } from "../src/modules/ai-simulation-v1/ai-simulation-v1.service";
import { JOB_STATUS } from "../src/modules/ai-simulation-v1/ai-simulation-v1.constants";

describe("AiSimulationV1Service.requestRunJobAsync (M3.2)", () => {
  const configEnabled = { get aiSimulationV1Enabled() {
    return true;
  } } as AiSimulationV1ConfigService;

  async function buildService(prisma: Record<string, unknown>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiSimulationV1Service,
        { provide: PrismaService, useValue: prisma },
        { provide: QuestionnaireService, useValue: {} },
        { provide: AiSimulationV1ConfigService, useValue: configEnabled },
        { provide: AiSimulationV1ChatClient, useValue: { complete: jest.fn() } },
      ],
    }).compile();
    return moduleRef.get(AiSimulationV1Service);
  }

  it("returns running immediately without awaiting runAiSimulationV1JobExecution", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findFirst: jest.fn().mockResolvedValue({ id: "job1", jobStatus: JOB_STATUS.QUEUED }),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      aiSimulationV1Item: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = await buildService(prisma);
    const execSpy = jest.spyOn(aiSimRunner, "runAiSimulationV1JobExecution").mockResolvedValue(undefined);

    const t0 = Date.now();
    const out = await service.requestRunJobAsync("job1", "viewer1");
    const elapsed = Date.now() - t0;

    expect(out.ok).toBe(true);
    expect(out.jobId).toBe("job1");
    expect(out.jobStatus).toBe(JOB_STATUS.RUNNING);
    expect(out.started).toBe(true);
    expect(elapsed).toBeLessThan(500);
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(execSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma,
        completeChat: expect.any(Function),
        getProfileForUser: expect.any(Function),
      }),
      { jobId: "job1", viewerUserId: "viewer1" },
    );

    execSpy.mockRestore();
  });

  it("does not schedule execute when job is already running", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findFirst: jest.fn().mockResolvedValue({ id: "job1", jobStatus: JOB_STATUS.RUNNING }),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = await buildService(prisma);
    const execSpy = jest.spyOn(aiSimRunner, "runAiSimulationV1JobExecution");

    const out = await service.requestRunJobAsync("job1", "viewer1");

    expect(out.started).toBe(false);
    expect(out.reason).toBe("already_running");
    expect(prisma.aiSimulationV1Job.updateMany).not.toHaveBeenCalled();
    expect(execSpy).not.toHaveBeenCalled();

    execSpy.mockRestore();
  });

  it("does not schedule execute when job is already completed", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findFirst: jest.fn().mockResolvedValue({ id: "job1", jobStatus: JOB_STATUS.COMPLETED }),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = await buildService(prisma);
    const execSpy = jest.spyOn(aiSimRunner, "runAiSimulationV1JobExecution");

    const out = await service.requestRunJobAsync("job1", "viewer1");

    expect(out.started).toBe(false);
    expect(out.reason).toBe("already_completed");
    expect(execSpy).not.toHaveBeenCalled();

    execSpy.mockRestore();
  });

  it("returns claim_lost when concurrent claim loses queued→running race", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findFirst: jest.fn().mockResolvedValue({ id: "job1", jobStatus: JOB_STATUS.QUEUED }),
        findUnique: jest.fn().mockResolvedValue({ jobStatus: JOB_STATUS.RUNNING }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
    };
    const service = await buildService(prisma);
    const execSpy = jest.spyOn(aiSimRunner, "runAiSimulationV1JobExecution");

    const out = await service.requestRunJobAsync("job1", "viewer1");

    expect(out.started).toBe(false);
    expect(out.jobStatus).toBe(JOB_STATUS.RUNNING);
    expect(out.reason).toBe("claim_lost_or_state_changed");
    expect(execSpy).not.toHaveBeenCalled();

    execSpy.mockRestore();
  });

  it("throws NotFound when job id does not match viewer", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = await buildService(prisma);
    await expect(service.requestRunJobAsync("job1", "viewer1")).rejects.toBeInstanceOf(NotFoundException);
  });
});
