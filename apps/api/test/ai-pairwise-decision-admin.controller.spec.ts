import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { AiPairwiseDecisionAdminController } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-admin.controller";
import { AiPairwiseDecisionJobService } from "../src/modules/ai-pairwise-decision/ai-pairwise-decision-job.service";
import { AdminService } from "../src/modules/admin/admin.service";

describe("AiPairwiseDecisionAdminController", () => {
  it("delegates create/run/get to job service after admin gate", async () => {
    const admin = { assertCanRunAiSimulationV1: jest.fn() };
    const jobs = {
      createOrReusePairwiseDecisionJob: jest.fn().mockResolvedValue({ reused: false, job: { id: "j1" } }),
      requestAdminRunPairwiseDecisionJob: jest.fn().mockResolvedValue({
        ok: true,
        jobId: "j1",
        jobStatus: "queued",
        started: false,
        reason: "enqueued_for_worker",
      }),
      getPairwiseDecisionJob: jest.fn().mockResolvedValue({ id: "j1" }),
    };
    const mod = await Test.createTestingModule({
      controllers: [AiPairwiseDecisionAdminController],
      providers: [
        { provide: AdminService, useValue: admin },
        { provide: AiPairwiseDecisionJobService, useValue: jobs },
      ],
    }).compile();

    const c = mod.get(AiPairwiseDecisionAdminController);
    await c.createJob({ user: { userId: "admin-1" } } as never, { viewerUserId: "v", poolId: "p" } as never);
    expect(admin.assertCanRunAiSimulationV1).toHaveBeenCalledWith("admin-1");
    expect(jobs.createOrReusePairwiseDecisionJob).toHaveBeenCalledWith({ viewerUserId: "v", poolId: "p" });

    await c.runJob({ user: { userId: "admin-1" } } as never, "j1");
    expect(jobs.requestAdminRunPairwiseDecisionJob).toHaveBeenCalledWith("j1");

    await c.getJob({ user: { userId: "admin-1" } } as never, "j1");
    expect(jobs.getPairwiseDecisionJob).toHaveBeenCalledWith("j1");
  });

  it("throws when unauthenticated", async () => {
    const mod = await Test.createTestingModule({
      controllers: [AiPairwiseDecisionAdminController],
      providers: [
        { provide: AdminService, useValue: { assertCanRunAiSimulationV1: jest.fn() } },
        { provide: AiPairwiseDecisionJobService, useValue: {} },
      ],
    }).compile();
    const c = mod.get(AiPairwiseDecisionAdminController);
    await expect(c.createJob({ user: {} } as never, { viewerUserId: "v", poolId: "p" } as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
