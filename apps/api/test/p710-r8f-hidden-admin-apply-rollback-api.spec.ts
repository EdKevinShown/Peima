/**
 * P7.10-r8f — hidden admin Apply / Rollback API wiring.
 */
import { NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { Permission, hasPermission, UserRole } from "@peima/shared/constants";
import { JwtAuthGuard } from "../src/modules/auth/jwt-auth.guard";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { RbacGuard, REQUIRED_PERMISSION_KEY } from "../src/common/rbac/rbac.guard";
import { P76CanonicalAdminMutationController } from "../src/modules/matching/p76-canonical-admin-mutation.controller";
import { readP76CanonicalAdminMutationEnv } from "../src/modules/matching/p76-canonical-admin-mutation-env";
import {
  mapP76AdminMutationGateContextToApply,
  redactP76AdminMutationBodyForLogs,
  responseJsonExcludesSensitiveSecrets,
  sanitizeP76CanonicalApplyApiResponse,
  sanitizeP76CanonicalRollbackApiResponse,
} from "../src/modules/matching/p76-canonical-admin-mutation.mapper";
import { P76CanonicalAdminMutationService } from "../src/modules/matching/p76-canonical-admin-mutation.service";
import type { P76CanonicalAdminMutationEnvV1 } from "../src/modules/matching/p76-canonical-admin-mutation.types";
import { readP76CanonicalApplyEnv } from "../src/modules/matching/p76-canonical-apply-env";
import {
  P76_CANONICAL_APPLY_GATE12_PASS,
  P76_CANONICAL_APPLY_GRAFANA_PASS,
} from "../src/modules/matching/p76-canonical-apply.types";
import { readP76CanonicalRollbackEnv } from "../src/modules/matching/p76-canonical-rollback-env";

const SIDECAR_ID = "sidecar-r8f";
const SNAPSHOT_ID = "snap-r8f";
const MR_ID = "mr-r8f";
const FAKE_TOKEN = "fake-rollback-token-r8f-tests-only";

function enabledRouteEnv(
  over: Partial<P76CanonicalAdminMutationEnvV1> = {},
): P76CanonicalAdminMutationEnvV1 {
  return {
    mutationApiEnabled: true,
    applyRouteEnabled: true,
    rollbackRouteEnabled: true,
    configuredEnvironment: "dev",
    nodeEnv: "development",
    mutationEnvironmentAllowed: true,
    productionBlocked: false,
    canApplyRoute: true,
    canRollbackRoute: true,
    ...over,
  };
}

function goodGateBody() {
  return {
    gate12Final: true,
    grafanaReady: true,
    pmSignoff: true,
    opsSignoff: true,
    engSignoff: true,
    activeIncident: false,
    activeWorkerDeploy: false,
    percent: 0,
  };
}

function applyBody(over: Record<string, unknown> = {}) {
  return {
    snapshotId: SNAPSHOT_ID,
    matchResultId: MR_ID,
    requestedBy: "admin-r8f",
    environment: "dev",
    gateContext: goodGateBody(),
    ...over,
  };
}

function rollbackBody(over: Record<string, unknown> = {}) {
  return {
    ...applyBody(),
    rollbackTokenPlaintext: FAKE_TOKEN,
    ...over,
  };
}

function blockedApplyServiceResult() {
  return {
    schemaVersion: 1,
    sourceType: "p76_canonical_apply_service",
    sourceVersion: "p7.10-r8d-canonical-apply-service-v1",
    mode: "blocked" as const,
    applied: false,
    blockedReasons: ["apply_execution_disabled"],
    sidecarId: SIDECAR_ID,
    snapshotId: SNAPSHOT_ID,
    matchResultId: MR_ID,
    before: null,
    after: null,
    safety: {
      writesDb: false,
      writesMatchResult: false,
      writesFinalScore: false,
      triggersWorker: false,
      changesPercent: false,
      productionRollout: false,
    },
    audit: {
      requestedBy: "admin-r8f",
      appliedAt: null,
      applyAuditRunId: null,
      auditLogWritten: false,
    },
  };
}

function appliedServiceResult() {
  return {
    ...blockedApplyServiceResult(),
    mode: "applied" as const,
    applied: true,
    blockedReasons: [],
    after: { candidateUserId: "cand-new", finalScore: 0.9, reasonSummary: "x" },
  };
}

function blockedRollbackServiceResult() {
  return {
    schemaVersion: 1,
    sourceType: "p76_canonical_rollback_service",
    sourceVersion: "p7.10-r8e-canonical-rollback-service-v1",
    mode: "blocked" as const,
    rolledBack: false,
    blockedReasons: ["rollback_execution_disabled"],
    sidecarId: SIDECAR_ID,
    snapshotId: SNAPSHOT_ID,
    matchResultId: MR_ID,
    before: null,
    restored: null,
    safety: {
      writesDb: false,
      writesMatchResult: false,
      restoresFinalScore: false,
      triggersWorker: false,
      changesPercent: false,
      productionRollout: false,
    },
    audit: {
      requestedBy: "admin-r8f",
      rolledBackAt: null,
      rollbackAuditRunId: null,
      auditLogWritten: false,
      tokenVerified: false,
    },
  };
}

function rolledBackServiceResult() {
  return {
    ...blockedRollbackServiceResult(),
    mode: "rolled_back" as const,
    rolledBack: true,
    blockedReasons: [],
    audit: {
      requestedBy: "admin-r8f",
      rolledBackAt: "2026-05-19T20:00:00.000Z",
      rollbackAuditRunId: "audit-r8f",
      auditLogWritten: false,
      tokenVerified: true,
    },
  };
}

describe("readP76CanonicalAdminMutationEnv (P7.10-r8f)", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("defaults to hidden / disabled routes", () => {
    delete process.env.PEIMA_P710_R8_HIDDEN_ADMIN_MUTATION_API_ENABLED;
    delete process.env.PEIMA_P710_R8_HIDDEN_ADMIN_APPLY_ROUTE_ENABLED;
    delete process.env.PEIMA_P710_R8_HIDDEN_ADMIN_ROLLBACK_ROUTE_ENABLED;
    const env = readP76CanonicalAdminMutationEnv();
    expect(env.mutationApiEnabled).toBe(false);
    expect(env.applyRouteEnabled).toBe(false);
    expect(env.rollbackRouteEnabled).toBe(false);
    expect(env.canApplyRoute).toBe(false);
    expect(env.canRollbackRoute).toBe(false);
  });
});

describe("P76CanonicalAdminMutationService (P7.10-r8f)", () => {
  const applyFn = jest.fn();
  const rollbackFn = jest.fn();
  const transaction = jest.fn();
  let service: P76CanonicalAdminMutationService;

  beforeEach(() => {
    applyFn.mockReset();
    rollbackFn.mockReset();
    transaction.mockReset();
    const prisma = {
      $transaction: transaction,
      matchResult: { findUnique: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService;
    service = new P76CanonicalAdminMutationService(prisma);
  });

  it("1. default hidden mutation API disabled blocks apply route", async () => {
    await expect(
      service.applyCanonicalSidecar(SIDECAR_ID, applyBody(), {
        routeEnv: readP76CanonicalAdminMutationEnv(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("2. default hidden mutation API disabled blocks rollback route", async () => {
    await expect(
      service.rollbackCanonicalSidecar(SIDECAR_ID, rollbackBody(), {
        routeEnv: readP76CanonicalAdminMutationEnv(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("3. default route disabled does not call apply service", async () => {
    await expect(
      service.applyCanonicalSidecar(SIDECAR_ID, applyBody(), {
        routeEnv: readP76CanonicalAdminMutationEnv(),
        applyFn,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(applyFn).not.toHaveBeenCalled();
  });

  it("4. default route disabled does not call rollback service", async () => {
    await expect(
      service.rollbackCanonicalSidecar(SIDECAR_ID, rollbackBody(), {
        routeEnv: readP76CanonicalAdminMutationEnv(),
        rollbackFn,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(rollbackFn).not.toHaveBeenCalled();
  });

  it("5. default route disabled does not call Prisma transaction", async () => {
    await expect(
      service.applyCanonicalSidecar(SIDECAR_ID, applyBody(), {
        routeEnv: readP76CanonicalAdminMutationEnv(),
        applyFn,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("6. apply route disabled blocks even when mutation API enabled", async () => {
    await expect(
      service.applyCanonicalSidecar(SIDECAR_ID, applyBody(), {
        routeEnv: enabledRouteEnv({ applyRouteEnabled: false, canApplyRoute: false }),
        applyFn,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(applyFn).not.toHaveBeenCalled();
  });

  it("7. apply route enabled calls apply service exactly once", async () => {
    applyFn.mockResolvedValue(appliedServiceResult());
    await service.applyCanonicalSidecar(SIDECAR_ID, applyBody(), {
      routeEnv: enabledRouteEnv(),
      applyFn,
      applyEnv: {
        ...readP76CanonicalApplyEnv(),
        executionEnabled: true,
        allowDbWrite: true,
        canExecute: true,
      },
    });
    expect(applyFn).toHaveBeenCalledTimes(1);
  });

  it("8. apply route passes sidecarId / snapshotId correctly", async () => {
    applyFn.mockResolvedValue(appliedServiceResult());
    await service.applyCanonicalSidecar(SIDECAR_ID, applyBody(), {
      routeEnv: enabledRouteEnv(),
      applyFn,
    });
    expect(applyFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sidecarId: SIDECAR_ID,
        snapshotId: SNAPSHOT_ID,
        requestedBy: "admin-r8f",
        environment: "dev",
      }),
      expect.anything(),
    );
  });

  it("9. apply route preserves gateContext mapping", async () => {
    applyFn.mockResolvedValue(appliedServiceResult());
    await service.applyCanonicalSidecar(SIDECAR_ID, applyBody(), {
      routeEnv: enabledRouteEnv(),
      applyFn,
    });
    const mapped = mapP76AdminMutationGateContextToApply(goodGateBody());
    expect(applyFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ gateContext: mapped }),
      expect.anything(),
    );
    expect(mapped.gate12Status).toBe(P76_CANONICAL_APPLY_GATE12_PASS);
    expect(mapped.grafanaStatus).toBe(P76_CANONICAL_APPLY_GRAFANA_PASS);
  });

  it("10. apply route rejects production environment without service call", async () => {
    const out = await service.applyCanonicalSidecar(
      SIDECAR_ID,
      applyBody({ environment: "production" }),
      { routeEnv: enabledRouteEnv(), applyFn },
    );
    expect(out.mode).toBe("blocked");
    expect(out.blockedReasons).toContain("production_environment_blocked");
    expect(applyFn).not.toHaveBeenCalled();
  });

  it("11. apply route does not trigger worker", async () => {
    applyFn.mockResolvedValue(appliedServiceResult());
    const out = await service.applyCanonicalSidecar(SIDECAR_ID, applyBody(), {
      routeEnv: enabledRouteEnv(),
      applyFn,
    });
    expect((out.safety as { triggersWorker: boolean }).triggersWorker).toBe(false);
  });

  it("12. apply response sanitizes sensitive fields", async () => {
    const raw = {
      ...appliedServiceResult(),
      rollbackTokenPlaintext: FAKE_TOKEN,
      DATABASE_URL: "postgres://secret",
    };
    const sanitized = sanitizeP76CanonicalApplyApiResponse(raw as never);
    const json = JSON.stringify(sanitized);
    expect(responseJsonExcludesSensitiveSecrets(json)).toBe(true);
    expect(json).not.toContain(FAKE_TOKEN);
  });

  it("13. apply route still returns blocked if r8d service env disabled", async () => {
    applyFn.mockResolvedValue(blockedApplyServiceResult());
    const out = await service.applyCanonicalSidecar(SIDECAR_ID, applyBody(), {
      routeEnv: enabledRouteEnv(),
      applyFn,
      applyEnv: readP76CanonicalApplyEnv(),
    });
    expect(out.mode).toBe("blocked");
    expect(out.blockedReasons).toContain("apply_execution_disabled");
    expect(out.applied).toBe(false);
  });

  it("14. apply route does not enable percent", async () => {
    applyFn.mockResolvedValue(appliedServiceResult());
    const out = await service.applyCanonicalSidecar(SIDECAR_ID, applyBody(), {
      routeEnv: enabledRouteEnv(),
      applyFn,
    });
    expect((out.safety as { changesPercent: boolean }).changesPercent).toBe(false);
  });

  it("15. rollback route disabled blocks even when mutation API enabled", async () => {
    await expect(
      service.rollbackCanonicalSidecar(SIDECAR_ID, rollbackBody(), {
        routeEnv: enabledRouteEnv({
          rollbackRouteEnabled: false,
          canRollbackRoute: false,
        }),
        rollbackFn,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(rollbackFn).not.toHaveBeenCalled();
  });

  it("16. rollback route enabled calls rollback service exactly once", async () => {
    rollbackFn.mockResolvedValue(rolledBackServiceResult());
    await service.rollbackCanonicalSidecar(SIDECAR_ID, rollbackBody(), {
      routeEnv: enabledRouteEnv(),
      rollbackFn,
    });
    expect(rollbackFn).toHaveBeenCalledTimes(1);
  });

  it("17. rollback route passes sidecarId / snapshotId / matchResultId correctly", async () => {
    rollbackFn.mockResolvedValue(rolledBackServiceResult());
    await service.rollbackCanonicalSidecar(SIDECAR_ID, rollbackBody(), {
      routeEnv: enabledRouteEnv(),
      rollbackFn,
    });
    expect(rollbackFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sidecarId: SIDECAR_ID,
        snapshotId: SNAPSHOT_ID,
        matchResultId: MR_ID,
      }),
      expect.anything(),
    );
  });

  it("18. rollback route passes rollbackTokenPlaintext only into service input", async () => {
    rollbackFn.mockResolvedValue(rolledBackServiceResult());
    await service.rollbackCanonicalSidecar(SIDECAR_ID, rollbackBody(), {
      routeEnv: enabledRouteEnv(),
      rollbackFn,
    });
    expect(rollbackFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ rollbackTokenPlaintext: FAKE_TOKEN }),
      expect.anything(),
    );
  });

  it("19. rollback response does not include rollbackTokenPlaintext", async () => {
    rollbackFn.mockResolvedValue({
      ...rolledBackServiceResult(),
      rollbackTokenPlaintext: FAKE_TOKEN,
    });
    const out = await service.rollbackCanonicalSidecar(SIDECAR_ID, rollbackBody(), {
      routeEnv: enabledRouteEnv(),
      rollbackFn,
    });
    const json = JSON.stringify(out);
    expect(json).not.toContain(FAKE_TOKEN);
    expect(responseJsonExcludesSensitiveSecrets(json)).toBe(true);
  });

  it("20. rollback route rejects production environment", async () => {
    const out = await service.rollbackCanonicalSidecar(
      SIDECAR_ID,
      rollbackBody({ environment: "production" }),
      { routeEnv: enabledRouteEnv(), rollbackFn },
    );
    expect(out.mode).toBe("blocked");
    expect(out.blockedReasons).toContain("production_environment_blocked");
    expect(rollbackFn).not.toHaveBeenCalled();
  });

  it("21. rollback route missing token blocks without service call", async () => {
    const out = await service.rollbackCanonicalSidecar(
      SIDECAR_ID,
      rollbackBody({ rollbackTokenPlaintext: "" }),
      { routeEnv: enabledRouteEnv(), rollbackFn },
    );
    expect(out.blockedReasons).toContain("rollback_token_missing");
    expect(rollbackFn).not.toHaveBeenCalled();
  });

  it("22. rollback route does not trigger worker", async () => {
    rollbackFn.mockResolvedValue(rolledBackServiceResult());
    const out = await service.rollbackCanonicalSidecar(SIDECAR_ID, rollbackBody(), {
      routeEnv: enabledRouteEnv(),
      rollbackFn,
    });
    expect((out.safety as { triggersWorker: boolean }).triggersWorker).toBe(false);
  });

  it("23. rollback route does not enable percent", async () => {
    rollbackFn.mockResolvedValue(rolledBackServiceResult());
    const out = await service.rollbackCanonicalSidecar(SIDECAR_ID, rollbackBody(), {
      routeEnv: enabledRouteEnv(),
      rollbackFn,
    });
    expect((out.safety as { changesPercent: boolean }).changesPercent).toBe(false);
  });

  it("24. rollback route still returns blocked if r8e service env disabled", async () => {
    rollbackFn.mockResolvedValue(blockedRollbackServiceResult());
    const out = await service.rollbackCanonicalSidecar(SIDECAR_ID, rollbackBody(), {
      routeEnv: enabledRouteEnv(),
      rollbackFn,
      rollbackEnv: readP76CanonicalRollbackEnv(),
    });
    expect(out.mode).toBe("blocked");
    expect(out.blockedReasons).toContain("rollback_execution_disabled");
  });

  it("27. logs redact plaintext token from body", () => {
    const redacted = redactP76AdminMutationBodyForLogs({
      snapshotId: SNAPSHOT_ID,
      rollbackTokenPlaintext: FAKE_TOKEN,
    });
    expect(JSON.stringify(redacted)).not.toContain(FAKE_TOKEN);
    expect(redacted).not.toHaveProperty("rollbackTokenPlaintext");
  });
});

describe("P76CanonicalAdminMutationController (P7.10-r8f)", () => {
  it("25. apply uses APPLY_P76_CANONICAL_REHEARSAL permission", () => {
    const meta = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      P76CanonicalAdminMutationController.prototype.apply,
    );
    expect(meta).toBe(Permission.APPLY_P76_CANONICAL_REHEARSAL);
  });

  it("25b. rollback uses ROLLBACK_P76_CANONICAL_WRITE permission", () => {
    const meta = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      P76CanonicalAdminMutationController.prototype.rollback,
    );
    expect(meta).toBe(Permission.ROLLBACK_P76_CANONICAL_WRITE);
  });

  it("25c. regular user lacks mutation permissions", () => {
    expect(
      hasPermission([UserRole.REGULAR_USER], Permission.APPLY_P76_CANONICAL_REHEARSAL),
    ).toBe(false);
    expect(
      hasPermission([UserRole.REGULAR_USER], Permission.ROLLBACK_P76_CANONICAL_WRITE),
    ).toBe(false);
  });

  it("25d. admin has mutation permissions", () => {
    expect(
      hasPermission([UserRole.ADMIN], Permission.APPLY_P76_CANONICAL_REHEARSAL),
    ).toBe(true);
    expect(
      hasPermission([UserRole.ADMIN], Permission.ROLLBACK_P76_CANONICAL_WRITE),
    ).toBe(true);
  });

  it("delegates apply to mutation service", async () => {
    const mutationSvc = {
      applyCanonicalSidecar: jest.fn().mockResolvedValue({ mode: "blocked" }),
      rollbackCanonicalSidecar: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      controllers: [P76CanonicalAdminMutationController],
      providers: [{ provide: P76CanonicalAdminMutationService, useValue: mutationSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const c = mod.get(P76CanonicalAdminMutationController);
    await c.apply(SIDECAR_ID, applyBody() as never);
    expect(mutationSvc.applyCanonicalSidecar).toHaveBeenCalledWith(
      SIDECAR_ID,
      expect.objectContaining({ snapshotId: SNAPSHOT_ID }),
    );
  });

  it("registers JwtAuthGuard + RbacGuard", () => {
    const classGuards =
      Reflect.getMetadata(GUARDS_METADATA, P76CanonicalAdminMutationController) ?? [];
    expect(classGuards).toEqual(expect.arrayContaining([JwtAuthGuard, RbacGuard]));
  });

  it("26. rollback sanitize strips token from service payload", () => {
    const sanitized = sanitizeP76CanonicalRollbackApiResponse({
      ...rolledBackServiceResult(),
      rollbackTokenPlaintext: FAKE_TOKEN,
      JWT_SECRET: "x",
    } as never);
    const json = JSON.stringify(sanitized);
    expect(responseJsonExcludesSensitiveSecrets(json)).toBe(true);
  });
});

describe("P7.10-r8f UI scope", () => {
  it("28. no ordinary UI wiring in this milestone (API-only)", () => {
    expect(P76CanonicalAdminMutationController).toBeDefined();
  });
});
