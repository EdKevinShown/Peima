import { Test } from "@nestjs/testing";
import {
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
import { AdminMyAiRecordsService } from "../src/modules/admin/admin-my-ai-records.service";
import { RbacService } from "../src/common/rbac/rbac.service";

function mockRbacService() {
  return {
    checkPermission: jest.fn().mockResolvedValue(true),
    hasPermission: jest.fn().mockReturnValue(true),
  };
}

describe("AdminController rrmObservationSummary", () => {
  function createModule(summaryImpl?: { getSummary: jest.Mock }) {
    return Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: {
            canSeeBatchMatchTrigger: jest.fn(),
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
        { provide: RrmEvalCollectorService, useValue: { buildAggregate: jest.fn() } },
        {
          provide: RrmObservationSummaryService,
          useValue:
            summaryImpl ??
            ({
              getSummary: jest.fn().mockResolvedValue({
                sampleSize: 1,
                coverage: { withResolvedProjectionUnavailableInDbNote: true },
              }),
            } as any),
        },
        { provide: AdminMyAiRecordsService, useValue: {} },
        { provide: RbacService, useValue: mockRbacService() },
      ],
    }).compile();
  }

  it("requires auth and admin gate, delegates summary query", async () => {
    const mod = await createModule();
    const c = mod.get(AdminController);
    const admin = mod.get(AdminService) as unknown as { assertCanRunAiSimulationV1: jest.Mock };
    const summary = mod.get(RrmObservationSummaryService) as unknown as { getSummary: jest.Mock };

    const out = await c.rrmObservationSummary(
      { user: { userId: "admin-1" } } as never,
      "20",
    );

    expect(admin.assertCanRunAiSimulationV1).toHaveBeenCalledWith("admin-1");
    expect(summary.getSummary).toHaveBeenCalledWith("20");
    expect(out).toEqual({
      sampleSize: 1,
      coverage: { withResolvedProjectionUnavailableInDbNote: true },
    });
  });

  it("throws UnauthorizedException when token user missing", async () => {
    const mod = await createModule();
    const c = mod.get(AdminController);
    await expect(c.rrmObservationSummary({ user: {} } as never, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("returns safe internal error when summary service fails", async () => {
    const mod = await createModule({
      getSummary: jest.fn().mockRejectedValue(new Error("db://secret-connection-string")),
    });
    const c = mod.get(AdminController);
    await expect(
      c.rrmObservationSummary({ user: { userId: "admin-1" } } as never, "50"),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(
      c.rrmObservationSummary({ user: { userId: "admin-1" } } as never, "50"),
    ).rejects.toMatchObject({
      response: {
        message: "failed_to_build_rrm_observation_summary",
      },
    });
  });
});
