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

describe("AdminController matchingObservabilitySummary", () => {
  function createModule(summaryImpl?: { getSummary: jest.Mock }) {
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
        { provide: RrmObservationSummaryService, useValue: { getSummary: jest.fn() } },
        {
          provide: MatchingObservabilitySummaryService,
          useValue:
            summaryImpl ??
            ({
              getSummary: jest.fn().mockResolvedValue({
                schemaVersion: 1,
                sourceVersion: "m4.4-m1-admin-observability-summary-v1",
                pairwise: { totalInWindow: 0 },
              }),
            } as { getSummary: jest.Mock }),
        },
      ],
    }).compile();
  }

  it("requires auth and admin gate, delegates query params", async () => {
    const mod = await createModule();
    const c = mod.get(AdminController);
    const admin = mod.get(AdminService) as unknown as {
      assertCanReadMatchingObservabilitySummary: jest.Mock;
    };
    const summary = mod.get(MatchingObservabilitySummaryService) as unknown as {
      getSummary: jest.Mock;
    };

    const out = await c.matchingObservabilitySummary(
      { user: { userId: "admin-1" } } as never,
      "100",
      "7",
    );

    expect(admin.assertCanReadMatchingObservabilitySummary).toHaveBeenCalledWith("admin-1");
    expect(summary.getSummary).toHaveBeenCalledWith({ limit: "100", sinceDays: "7" });
    expect(out).toMatchObject({
      sourceVersion: "m4.4-m1-admin-observability-summary-v1",
    });
  });

  it("throws UnauthorizedException when token user missing", async () => {
    const mod = await createModule();
    const c = mod.get(AdminController);
    await expect(
      c.matchingObservabilitySummary({ user: {} } as never, undefined, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rethrows BadRequestException from summary service", async () => {
    const mod = await createModule({
      getSummary: jest.fn().mockRejectedValue(new BadRequestException("limit invalid")),
    });
    const c = mod.get(AdminController);
    await expect(
      c.matchingObservabilitySummary({ user: { userId: "admin-1" } } as never, "0", "30"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns safe internal error when summary service fails unexpectedly", async () => {
    const mod = await createModule({
      getSummary: jest.fn().mockRejectedValue(new Error("db://secret")),
    });
    const c = mod.get(AdminController);
    await expect(
      c.matchingObservabilitySummary({ user: { userId: "admin-1" } } as never, "50", "30"),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(
      c.matchingObservabilitySummary({ user: { userId: "admin-1" } } as never, "50", "30"),
    ).rejects.toMatchObject({
      response: { message: "failed_to_build_matching_observability_summary" },
    });
  });
});
