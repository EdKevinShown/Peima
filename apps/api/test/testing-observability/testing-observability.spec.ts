import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { TestingObservabilityGuard } from "../../src/modules/testing-observability/testing-observability.guard";
import { recordTestingEvent } from "../../src/modules/testing-observability/record-testing-event";
import { TestingObservabilityService } from "../../src/modules/testing-observability/testing-observability.service";

describe("TestingObservabilityGuard", () => {
  const guard = new TestingObservabilityGuard();
  const ctx = (headers: Record<string, string>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as Parameters<TestingObservabilityGuard["canActivate"]>[0];

  afterEach(() => {
    delete process.env.PEIMA_TEST_OBSERVABILITY_ENABLED;
    delete process.env.PEIMA_TEST_OBSERVABILITY_TOKEN;
  });

  it("returns 404 when flag off", () => {
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "0";
    expect(() => guard.canActivate(ctx({}))).toThrow(NotFoundException);
  });

  it("returns 401 when token configured but missing", () => {
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "1";
    process.env.PEIMA_TEST_OBSERVABILITY_TOKEN = "secret";
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
  });

  it("allows when flag on and token matches", () => {
    process.env.PEIMA_TEST_OBSERVABILITY_ENABLED = "1";
    process.env.PEIMA_TEST_OBSERVABILITY_TOKEN = "secret";
    expect(
      guard.canActivate(ctx({ "x-peima-debug-token": "secret" })),
    ).toBe(true);
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

  beforeEach(() => {
    jest.clearAllMocks();
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

  it("createMatchFeedback creates row without touching match result", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1" });
    prisma.testingMatchFeedback.create.mockResolvedValue({
      id: "f1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const out = await service.createMatchFeedback({
      userId: "u1",
      rating: "accurate",
    });
    expect(out.id).toBe("f1");
    expect(prisma.matchResult.findUnique).not.toHaveBeenCalled();
    expect(prisma.testingMatchFeedback.create).toHaveBeenCalled();
  });
});
