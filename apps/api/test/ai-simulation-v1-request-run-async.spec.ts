import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import * as aiSimRunner from "@peima/ai-simulation-v1-runner";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { QuestionnaireService } from "../src/modules/questionnaire/questionnaire.service";
import { AiSimulationV1ChatClient } from "../src/modules/ai-simulation-v1/ai-simulation-v1-chat.client";
import { AiSimulationV1ConfigService } from "../src/modules/ai-simulation-v1/ai-simulation-v1.config.service";
import { AiSimulationV1Service } from "../src/modules/ai-simulation-v1/ai-simulation-v1.service";
import { JOB_STATUS } from "../src/modules/ai-simulation-v1/ai-simulation-v1.constants";

describe("AiSimulationV1Service.requestRunJobAsync (M3.3-M1 API enqueue)", () => {
  const configEnabled = {
    get aiSimulationV1Enabled() {
      return true;
    },
  } as AiSimulationV1ConfigService;

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

  it("returns queued immediately without calling runAiSimulationV1JobExecution", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findFirst: jest.fn().mockResolvedValue({ id: "job1", jobStatus: JOB_STATUS.QUEUED }),
      },
    };
    const service = await buildService(prisma);
    const execSpy = jest.spyOn(aiSimRunner, "runAiSimulationV1JobExecution");

    const t0 = Date.now();
    const out = await service.requestRunJobAsync("job1", "viewer1");
    const elapsed = Date.now() - t0;

    expect(out.ok).toBe(true);
    expect(out.jobId).toBe("job1");
    expect(out.jobStatus).toBe(JOB_STATUS.QUEUED);
    expect(out.started).toBe(false);
    expect(out.reason).toBe("enqueued_for_worker");
    expect(elapsed).toBeLessThan(500);
    expect(execSpy).not.toHaveBeenCalled();

    execSpy.mockRestore();
  });

  it("does not call runner when job is already running", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findFirst: jest.fn().mockResolvedValue({ id: "job1", jobStatus: JOB_STATUS.RUNNING }),
      },
    };
    const service = await buildService(prisma);
    const execSpy = jest.spyOn(aiSimRunner, "runAiSimulationV1JobExecution");

    const out = await service.requestRunJobAsync("job1", "viewer1");

    expect(out.started).toBe(false);
    expect(out.reason).toBe("already_running");
    expect(out.jobStatus).toBe(JOB_STATUS.RUNNING);
    expect(execSpy).not.toHaveBeenCalled();

    execSpy.mockRestore();
  });

  it("does not call runner when job is already completed", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findFirst: jest.fn().mockResolvedValue({ id: "job1", jobStatus: JOB_STATUS.COMPLETED }),
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

  it("throws NotFound when job id does not match viewer", async () => {
    const prisma = {
      aiSimulationV1Job: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = await buildService(prisma);
    await expect(service.requestRunJobAsync("job1", "viewer1")).rejects.toBeInstanceOf(NotFoundException);
  });
});
