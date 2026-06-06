import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  assertTestingObservabilityDebugTokenStrong,
  assertTestingObservabilityStartupConfig,
  formatTestingMatchFeedbackSource,
} from "../../src/modules/testing-observability/testing-observability-env";
import { TestingObservabilityGuard } from "../../src/modules/testing-observability/testing-observability.guard";
import { recordTestingEvent } from "../../src/modules/testing-observability/record-testing-event";
import { TestingObservabilityService } from "../../src/modules/testing-observability/testing-observability.service";

const STRONG_DEBUG_TOKEN =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("testing-observability-env security", () => {
  const enabledKey = "PEIMA_TEST_OBSERVABILITY_ENABLED";
  const tokenKey = "PEIMA_TEST_OBSERVABILITY_TOKEN";
  const adminKey = "PEIMA_ADMIN_USER_IDS";
  const nodeEnvKey = "NODE_ENV";
  let prevEnabled: string | undefined;
  let prevToken: string | undefined;
  let prevAdmin: string | undefined;
  let prevNodeEnv: string | undefined;

  beforeEach(() => {
    prevEnabled = process.env[enabledKey];
    prevToken = process.env[tokenKey];
    prevAdmin = process.env[adminKey];
    prevNodeEnv = process.env[nodeEnvKey];
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env[enabledKey];
    else process.env[enabledKey] = prevEnabled;
    if (prevToken === undefined) delete process.env[tokenKey];
    else process.env[tokenKey] = prevToken;
    if (prevAdmin === undefined) delete process.env[adminKey];
    else process.env[adminKey] = prevAdmin;
    if (prevNodeEnv === undefined) delete process.env[nodeEnvKey];
    else process.env[nodeEnvKey] = prevNodeEnv;
  });

  it("rejects weak debug tokens", () => {
    expect(() => assertTestingObservabilityDebugTokenStrong("secret")).toThrow(
      /weak placeholder/,
    );
    expect(() =>
      assertTestingObservabilityDebugTokenStrong("local-dev-only"),
    ).toThrow(/weak placeholder/);
    expect(() =>
      assertTestingObservabilityDebugTokenStrong("short-but-not-placeholder"),
    ).toThrow(/at least 32 characters/);
  });

  it("production enabled requires strong token and admin ids", () => {
    process.env.NODE_ENV = "production";
    process.env[enabledKey] = "1";
    delete process.env[tokenKey];
    expect(() => assertTestingObservabilityStartupConfig()).toThrow(
      /PEIMA_TEST_OBSERVABILITY_TOKEN is required/,
    );

    process.env[tokenKey] = "short-but-not-placeholder";
    expect(() => assertTestingObservabilityStartupConfig()).toThrow(
      /at least 32 characters/,
    );

    process.env[tokenKey] = STRONG_DEBUG_TOKEN;
    delete process.env[adminKey];
    expect(() => assertTestingObservabilityStartupConfig()).toThrow(
      /PEIMA_ADMIN_USER_IDS must list at least one admin/,
    );

    process.env[adminKey] = "admin1";
    expect(() => assertTestingObservabilityStartupConfig()).not.toThrow();
  });

  it("formatTestingMatchFeedbackSource records caller and subject", () => {
    expect(
      formatTestingMatchFeedbackSource(
        undefined,
        { callerUserId: "admin1", via: "admin_jwt" },
        "u1",
      ),
    ).toBe("testing_monitor_ui|caller=admin1|via=admin_jwt|subjectUserId=u1");
  });
});

describe("TestingObservabilityGuard", () => {
  const jwt = { verify: jest.fn() } as unknown as JwtService;
  const guard = new TestingObservabilityGuard(jwt);
  const ctx = (headers: Record<string, string>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as Parameters<TestingObservabilityGuard["canActivate"]>[0];

  afterEach(() => {
    delete process.env.PEIMA_TEST_OBSERVABILITY_ENABLED;
    delete process.env.PEIMA_TEST_OBSERVABILITY_TOKEN;
    delete process.env.PEIMA_ADMIN_USER_IDS;
    delete process.env.NODE_ENV;
    jest.clearAllMocks();
  });

  it("returns 404 when flag off", () => {
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "0";
    expect(() => guard.canActivate(ctx({}))).toThrow(NotFoundException);
  });

  it("returns 404 in production when flag off", () => {
    process.env.NODE_ENV = "production";
    delete process.env.PEIMA_TEST_OBSERVABILITY_ENABLED;
    expect(() => guard.canActivate(ctx({}))).toThrow(NotFoundException);
  });

  it("returns 401 when token configured but missing", () => {
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "1";
    process.env.PEIMA_TEST_OBSERVABILITY_TOKEN = STRONG_DEBUG_TOKEN;
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
  });

  it("rejects weak configured token when enabled", () => {
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "1";
    process.env.PEIMA_TEST_OBSERVABILITY_TOKEN = "local-dev-only";
    expect(() => guard.canActivate(ctx({}))).toThrow(/weak placeholder/);
  });

  it("allows when flag on and strong token matches", () => {
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "1";
    process.env.PEIMA_TEST_OBSERVABILITY_TOKEN = STRONG_DEBUG_TOKEN;
    expect(
      guard.canActivate(
        ctx({ "x-peima-debug-token": STRONG_DEBUG_TOKEN }),
      ),
    ).toBe(true);
  });

  it("allows admin JWT when no debug token header", () => {
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "1";
    process.env.PEIMA_ADMIN_USER_IDS = "admin1";
    (jwt.verify as jest.Mock).mockReturnValue({ sub: "admin1" });
    expect(
      guard.canActivate(ctx({ authorization: "Bearer fake.jwt" })),
    ).toBe(true);
  });

  it("forbids non-admin JWT when debug token is not used", () => {
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "1";
    process.env.PEIMA_ADMIN_USER_IDS = "admin1";
    (jwt.verify as jest.Mock).mockReturnValue({ sub: "user2" });
    expect(() =>
      guard.canActivate(ctx({ authorization: "Bearer fake.jwt" })),
    ).toThrow(ForbiddenException);
  });

  it("production requires admin JWT and debug token together", () => {
    process.env.NODE_ENV = "production";
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "1";
    process.env.PEIMA_TEST_OBSERVABILITY_TOKEN = STRONG_DEBUG_TOKEN;
    process.env.PEIMA_ADMIN_USER_IDS = "admin1";
    (jwt.verify as jest.Mock).mockReturnValue({ sub: "admin1" });

    expect(() =>
      guard.canActivate(ctx({ authorization: "Bearer fake.jwt" })),
    ).toThrow(UnauthorizedException);

    expect(
      guard.canActivate(
        ctx({
          authorization: "Bearer fake.jwt",
          "x-peima-debug-token": STRONG_DEBUG_TOKEN,
        }),
      ),
    ).toBe(true);
  });

  it("production rejects non-admin JWT even with debug token", () => {
    process.env.NODE_ENV = "production";
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "1";
    process.env.PEIMA_TEST_OBSERVABILITY_TOKEN = STRONG_DEBUG_TOKEN;
    process.env.PEIMA_ADMIN_USER_IDS = "admin1";
    (jwt.verify as jest.Mock).mockReturnValue({ sub: "user2" });

    expect(() =>
      guard.canActivate(
        ctx({
          authorization: "Bearer fake.jwt",
          "x-peima-debug-token": STRONG_DEBUG_TOKEN,
        }),
      ),
    ).toThrow(UnauthorizedException);
  });
});

describe("recordTestingEvent", () => {
  afterEach(() => {
    delete process.env.PEIMA_TEST_OBSERVABILITY_ENABLED;
  });

  it("no-ops when disabled", async () => {
    const create = jest.fn();
    await recordTestingEvent(
      { testingObservabilityEvent: { create } } as never,
      { eventType: "x", status: "success" },
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("swallows create errors", async () => {
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "1";
    const create = jest.fn().mockRejectedValue(new Error("db down"));
    await expect(
      recordTestingEvent(
        { testingObservabilityEvent: { create } } as never,
        { eventType: "x", status: "success" },
      ),
    ).resolves.toBeUndefined();
  });
});

describe("TestingObservabilityService", () => {
  const prisma = {
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    matchResult: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    userImage: { findFirst: jest.fn() },
    questionnaireAnswer: { findFirst: jest.fn(), findMany: jest.fn() },
    onboardingPhotoPreviewPool: { findFirst: jest.fn(), count: jest.fn() },
    userProfile: { findUnique: jest.fn() },
    testingObservabilityEvent: { findMany: jest.fn(), create: jest.fn() },
    testingMatchFeedback: { findMany: jest.fn(), create: jest.fn() },
    pairwisePoolFinalizeMeta: { findFirst: jest.fn() },
    matchResultRrmTop2DisplayMeta: { findUnique: jest.fn() },
  };

  const service = new TestingObservabilityService(prisma as never);
  const nodeEnvKey = "NODE_ENV";
  let prevNodeEnv: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    prevNodeEnv = process.env[nodeEnvKey];
  });

  afterEach(() => {
    if (prevNodeEnv === undefined) delete process.env[nodeEnvKey];
    else process.env[nodeEnvKey] = prevNodeEnv;
  });

  it("getUserMatch returns empty when no match results", async () => {
    prisma.matchResult.findMany.mockResolvedValue([]);
    await expect(service.getUserMatch("u1")).resolves.toEqual({
      latest: null,
      history: [],
    });
  });

  it("createMatchFeedback rejects invalid rating", async () => {
    await expect(
      service.createMatchFeedback({ userId: "u1", rating: "bad" }),
    ).rejects.toThrow("rating must be one of");
  });

  it("createMatchFeedback creates row and records caller in source", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1" });
    prisma.testingMatchFeedback.create.mockResolvedValue({
      id: "f1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const out = await service.createMatchFeedback(
      {
        userId: "u1",
        rating: "accurate",
      },
      { callerUserId: "admin1", via: "admin_jwt" },
    );
    expect(out.id).toBe("f1");
    expect(prisma.matchResult.findUnique).not.toHaveBeenCalled();
    expect(prisma.testingMatchFeedback.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source:
            "testing_monitor_ui|caller=admin1|via=admin_jwt|subjectUserId=u1",
        }),
      }),
    );
  });

  it("createMatchFeedback requires authenticated admin caller in production", async () => {
    process.env.NODE_ENV = "production";
    await expect(
      service.createMatchFeedback(
        { userId: "u1", rating: "accurate" },
        { callerUserId: null, via: "debug_token" },
      ),
    ).rejects.toThrow(/authenticated admin caller in production/);
  });
});
