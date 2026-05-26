import { Test } from "@nestjs/testing";
import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { AdminController } from "../src/modules/admin/admin.controller";
import { AdminService } from "../src/modules/admin/admin.service";
import { PrescreenV0Service } from "../src/modules/prescreen-v0/prescreen-v0.service";
import { PostPoolDeepScreenOrchestratorService } from "../src/modules/post-pool-deep-screen/post-pool-deep-screen-orchestrator.service";
import { AiSimulationV1Service } from "../src/modules/ai-simulation-v1/ai-simulation-v1.service";
import { MatchingObservabilitySummaryService } from "../src/modules/admin/matching-observability-summary.service";
import { RrmObservationSummaryService } from "../src/modules/admin/rrm-observation-summary.service";
import { RrmEvalCollectorService } from "../src/modules/rrm-eval";

describe("AdminController rrmEvalAggregate", () => {
  function createModule(evalImpl?: { buildAggregate: jest.Mock }) {
    return Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: {
            canSeeBatchMatchTrigger: jest.fn(),
            assertCanReadMatchingObservabilitySummary: jest.fn(),
            assertCanRunAiSimulationV1: jest.fn(),
            assertCanRunPostPoolDeepScreenShadow: jest.fn(),
            assertCanRunPrescreenDebug: jest.fn(),
            assertCanTriggerBatchMatch: jest.fn(),
            runBatchMatchSubprocess: jest.fn(),
          },
        },
        { provide: PrescreenV0Service, useValue: {} },
        { provide: PostPoolDeepScreenOrchestratorService, useValue: {} },
        { provide: AiSimulationV1Service, useValue: {} },
        { provide: MatchingObservabilitySummaryService, useValue: { getSummary: jest.fn() } },
        { provide: RrmObservationSummaryService, useValue: { getSummary: jest.fn() } },
        {
          provide: RrmEvalCollectorService,
          useValue:
            evalImpl ??
            ({
              buildAggregate: jest.fn().mockResolvedValue({
                sourceVersion: "rrm-eval-v1",
                appliedToMatchResult: false,
              }),
            } as { buildAggregate: jest.Mock }),
        },
      ],
    }).compile();
  }

  it("requires admin gate and delegates query params", async () => {
    const mod = await createModule();
    const c = mod.get(AdminController);
    const admin = mod.get(AdminService) as unknown as {
      assertCanReadMatchingObservabilitySummary: jest.Mock;
    };
    const evalService = mod.get(RrmEvalCollectorService) as unknown as {
      buildAggregate: jest.Mock;
    };

    const out = await c.rrmEvalAggregate(
      { user: { userId: "admin-1" } } as never,
      "100",
      "30",
    );

    expect(admin.assertCanReadMatchingObservabilitySummary).toHaveBeenCalledWith("admin-1");
    expect(evalService.buildAggregate).toHaveBeenCalledWith({
      limit: "100",
      sinceDays: "30",
    });
    expect(out).toMatchObject({
      sourceVersion: "rrm-eval-v1",
      appliedToMatchResult: false,
    });
  });

  it("throws UnauthorizedException when token user missing", async () => {
    const mod = await createModule();
    const c = mod.get(AdminController);
    await expect(
      c.rrmEvalAggregate({ user: {} } as never, undefined, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rethrows BadRequestException from aggregate service", async () => {
    const mod = await createModule({
      buildAggregate: jest.fn().mockRejectedValue(new BadRequestException("limit invalid")),
    });
    const c = mod.get(AdminController);
    await expect(
      c.rrmEvalAggregate({ user: { userId: "admin-1" } } as never, "0", "30"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns safe internal error when aggregate service fails unexpectedly", async () => {
    const mod = await createModule({
      buildAggregate: jest.fn().mockRejectedValue(new Error("db://secret")),
    });
    const c = mod.get(AdminController);
    await expect(
      c.rrmEvalAggregate({ user: { userId: "admin-1" } } as never, "50", "30"),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(
      c.rrmEvalAggregate({ user: { userId: "admin-1" } } as never, "50", "30"),
    ).rejects.toMatchObject({
      response: { message: "failed_to_build_rrm_eval_aggregate" },
    });
  });
});
