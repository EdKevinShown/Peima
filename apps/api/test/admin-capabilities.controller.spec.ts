/**
 * GET /admin/capabilities — RBAC gate (VIEW_ADMIN_CAPABILITIES only).
 */
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import {
  Permission,
  ROLE_PERMISSIONS_MAP,
  UserRole,
} from "@peima/shared/constants";
import { REQUIRED_PERMISSION_KEY, RbacGuard } from "../src/common/rbac/rbac.guard";
import { RbacService } from "../src/common/rbac/rbac.service";
import { JwtAuthGuard } from "../src/modules/auth/jwt-auth.guard";
import { AdminController } from "../src/modules/admin/admin.controller";
import { AdminService } from "../src/modules/admin/admin.service";
import { PrescreenV0Service } from "../src/modules/prescreen-v0/prescreen-v0.service";
import { PostPoolDeepScreenOrchestratorService } from "../src/modules/post-pool-deep-screen/post-pool-deep-screen-orchestrator.service";
import { AiSimulationV1Service } from "../src/modules/ai-simulation-v1/ai-simulation-v1.service";
import { MatchingObservabilitySummaryService } from "../src/modules/admin/matching-observability-summary.service";
import { RrmObservationSummaryService } from "../src/modules/admin/rrm-observation-summary.service";
import { RrmEvalCollectorService } from "../src/modules/rrm-eval";
import { AdminMyAiRecordsService } from "../src/modules/admin/admin-my-ai-records.service";

function createAdminModule(adminService: Partial<AdminService>) {
  return Test.createTestingModule({
    controllers: [AdminController],
    providers: [
      { provide: AdminService, useValue: adminService },
      { provide: PrescreenV0Service, useValue: {} },
      { provide: PostPoolDeepScreenOrchestratorService, useValue: {} },
      { provide: AiSimulationV1Service, useValue: {} },
      { provide: RrmObservationSummaryService, useValue: { getSummary: jest.fn() } },
      { provide: RrmEvalCollectorService, useValue: { buildAggregate: jest.fn() } },
      { provide: AdminMyAiRecordsService, useValue: { getMine: jest.fn() } },
      {
        provide: MatchingObservabilitySummaryService,
        useValue: { getSummary: jest.fn() },
      },
    ],
  });
}

describe("AdminController · GET /admin/capabilities metadata", () => {
  it("requires VIEW_ADMIN_CAPABILITIES on capabilities handler", () => {
    const meta = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      AdminController.prototype.capabilities,
    );
    expect(meta).toBe(Permission.VIEW_ADMIN_CAPABILITIES);
  });

  it("grants VIEW_ADMIN_CAPABILITIES to ADMIN role map only among default roles", () => {
    expect(ROLE_PERMISSIONS_MAP[UserRole.ADMIN]).toContain(
      Permission.VIEW_ADMIN_CAPABILITIES,
    );
    expect(ROLE_PERMISSIONS_MAP[UserRole.REGULAR_USER]).not.toContain(
      Permission.VIEW_ADMIN_CAPABILITIES,
    );
    expect(ROLE_PERMISSIONS_MAP[UserRole.OPERATOR]).not.toContain(
      Permission.VIEW_ADMIN_CAPABILITIES,
    );
    expect(ROLE_PERMISSIONS_MAP[UserRole.DATA_ANALYST]).not.toContain(
      Permission.VIEW_ADMIN_CAPABILITIES,
    );
  });
});

describe("AdminController · GET /admin/capabilities handler", () => {
  it("returns batchMatchTrigger for authenticated admin caller", async () => {
    const canSeeBatchMatchTrigger = jest.fn().mockReturnValue(true);
    const mod = await createAdminModule({ canSeeBatchMatchTrigger })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const c = mod.get(AdminController);

    const out = c.capabilities({ user: { userId: "admin-1" } } as never);
    expect(canSeeBatchMatchTrigger).toHaveBeenCalledWith("admin-1");
    expect(out).toEqual({ batchMatchTrigger: true });
  });

  it("throws UnauthorizedException when user id missing on handler", async () => {
    const mod = await createAdminModule({ canSeeBatchMatchTrigger: jest.fn() })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const c = mod.get(AdminController);
    expect(() => c.capabilities({ user: {} } as never)).toThrow(
      UnauthorizedException,
    );
  });
});

describe("Admin capabilities · JwtAuthGuard (401)", () => {
  it("rejects unauthenticated requests before handler", async () => {
    const mod = await createAdminModule({ canSeeBatchMatchTrigger: jest.fn() })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: () => {
          throw new UnauthorizedException();
        },
      })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const jwt = mod.get(JwtAuthGuard);
    expect(() => jwt.canActivate({} as ExecutionContext)).toThrow(
      UnauthorizedException,
    );
  });
});

describe("Admin capabilities · RbacGuard (403)", () => {
  it("returns 403 when user lacks view_admin_capabilities", async () => {
    const reflector = {
      get: jest.fn().mockReturnValue(Permission.VIEW_ADMIN_CAPABILITIES),
    };
    const rbacService = {
      checkPermission: jest.fn().mockResolvedValue(false),
    };
    const guard = new RbacGuard(
      reflector as unknown as Reflector,
      rbacService as unknown as RbacService,
    );
    const ctx = {
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: "regular-user" } }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(rbacService.checkPermission).toHaveBeenCalledWith(
      "regular-user",
      Permission.VIEW_ADMIN_CAPABILITIES,
    );
  });

  it("allows admin with view_admin_capabilities", async () => {
    const reflector = {
      get: jest.fn().mockReturnValue(Permission.VIEW_ADMIN_CAPABILITIES),
    };
    const rbacService = {
      checkPermission: jest.fn().mockResolvedValue(true),
    };
    const guard = new RbacGuard(
      reflector as unknown as Reflector,
      rbacService as unknown as RbacService,
    );
    const ctx = {
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: "admin-1" } }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
