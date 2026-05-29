import { Test } from "@nestjs/testing";
import { Permission } from "@peima/shared/constants";
import { JwtAuthGuard } from "../src/modules/auth/jwt-auth.guard";
import { RbacGuard, REQUIRED_PERMISSION_KEY } from "../src/common/rbac/rbac.guard";
import { P76AdminAllowlistApplyMetaController } from "../src/modules/matching/p76-admin-allowlist-apply-meta.controller";
import { P76AdminAllowlistApplyMetaService } from "../src/modules/matching/p76-admin-allowlist-apply-meta.service";

describe("P76AdminAllowlistApplyMetaController", () => {
  const listResult = {
    schemaVersion: "p7.6-r8g1-admin-allowlist-apply-meta-list-v1",
    rows: [],
    aggregate: { totalSidecarRows: 0 },
    pagination: { limit: 50, nextCursor: null },
  };
  const aggregateResult = {
    schemaVersion: "p7.6-r8g1-admin-allowlist-apply-meta-aggregate-v1",
    totalSidecarRows: 0,
  };
  const detailResult = {
    schemaVersion: "p7.6-r8g1-admin-allowlist-apply-meta-detail-v1",
    row: { id: "row-1" },
    derived: { sidecarStatus: "written" },
    stageSummary: { stage1Count: 1 },
    violationStatus: "ok",
  };

  it("delegates list, aggregate, and detail to service", async () => {
    const svc = {
      listP76AllowlistApplyMeta: jest.fn().mockResolvedValue(listResult),
      getP76AllowlistApplyMetaAggregate: jest
        .fn()
        .mockResolvedValue(aggregateResult),
      getP76AllowlistApplyMetaById: jest.fn().mockResolvedValue(detailResult),
    };
    const mod = await Test.createTestingModule({
      controllers: [P76AdminAllowlistApplyMetaController],
      providers: [{ provide: P76AdminAllowlistApplyMetaService, useValue: svc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const c = mod.get(P76AdminAllowlistApplyMetaController);

    await c.list({ limit: 10 } as never);
    expect(svc.listP76AllowlistApplyMeta).toHaveBeenCalled();

    await c.aggregate({ violationOnly: true } as never);
    expect(svc.getP76AllowlistApplyMetaAggregate).toHaveBeenCalled();

    await c.detail("row-1");
    expect(svc.getP76AllowlistApplyMetaById).toHaveBeenCalledWith("row-1");
  });

  it("aggregate route is not treated as id param", async () => {
    const svc = {
      listP76AllowlistApplyMeta: jest.fn(),
      getP76AllowlistApplyMetaAggregate: jest
        .fn()
        .mockResolvedValue(aggregateResult),
      getP76AllowlistApplyMetaById: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      controllers: [P76AdminAllowlistApplyMetaController],
      providers: [{ provide: P76AdminAllowlistApplyMetaService, useValue: svc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const c = mod.get(P76AdminAllowlistApplyMetaController);
    await c.aggregate({} as never);
    expect(svc.getP76AllowlistApplyMetaAggregate).toHaveBeenCalled();
    expect(svc.getP76AllowlistApplyMetaById).not.toHaveBeenCalled();
  });

  it("uses VIEW_P76_ALLOWLIST_APPLY_META permission on handlers", () => {
    const meta = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      P76AdminAllowlistApplyMetaController.prototype.list,
    );
    expect(meta).toBe(Permission.VIEW_P76_ALLOWLIST_APPLY_META);
  });
});
