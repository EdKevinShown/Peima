import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TestingObservabilityController } from "../../src/modules/testing-observability/testing-observability.controller";
import { TestingObservabilityGuard } from "../../src/modules/testing-observability/testing-observability.guard";
import { TestingObservabilityService } from "../../src/modules/testing-observability/testing-observability.service";

describe("TestingObservabilityController · matching-queue", () => {
  const listMatchingQueue = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    listMatchingQueue.mockResolvedValue({
      sourceVersion: "testing-observability-v1",
      generatedAt: "2026-06-09T00:00:00.000Z",
      statusFilter: "waiting",
      items: [],
    });
  });

  async function createController() {
    const mod = await Test.createTestingModule({
      controllers: [TestingObservabilityController],
      providers: [
        {
          provide: TestingObservabilityService,
          useValue: { listMatchingQueue },
        },
      ],
    })
      .overrideGuard(TestingObservabilityGuard)
      .useValue({ canActivate: () => true })
      .compile();
    return mod.get(TestingObservabilityController);
  }

  it("delegates status and limit query params", async () => {
    const controller = await createController();
    await controller.listMatchingQueue("waiting", "25");
    expect(listMatchingQueue).toHaveBeenCalledWith({
      status: "waiting",
      limit: "25",
    });
  });
});

describe("TestingObservabilityService · listMatchingQueue", () => {
  const prisma = {
    batchMatchQueue: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    testingObservabilityEvent: { findMany: jest.fn() },
  };

  const service = new TestingObservabilityService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.testingObservabilityEvent.findMany.mockResolvedValue([]);
  });

  it("defaults to waiting status filter", async () => {
    prisma.batchMatchQueue.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);

    const out = await service.listMatchingQueue({});

    expect(prisma.batchMatchQueue.findMany).toHaveBeenCalledWith({
      where: { status: "waiting" },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    expect(out.statusFilter).toBe("waiting");
    expect(out.items).toEqual([]);
  });

  it("lists all statuses when status=all", async () => {
    prisma.batchMatchQueue.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);

    await service.listMatchingQueue({ status: "all" });

    expect(prisma.batchMatchQueue.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
  });

  it("enriches rows with user nickname and gender", async () => {
    prisma.batchMatchQueue.findMany.mockResolvedValue([
      {
        id: "q1",
        userId: "u1",
        batchId: "b1",
        status: "waiting",
        createdAt: new Date("2026-06-09T10:00:00.000Z"),
        updatedAt: new Date("2026-06-09T10:05:00.000Z"),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: "u1",
        nickname: "小明",
        gender: "male",
        age: 28,
        city: "深圳",
        phone: "13800001111",
      },
    ]);

    const out = await service.listMatchingQueue({ status: "waiting" });

    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({
      queueId: "q1",
      userId: "u1",
      status: "waiting",
      batchId: "b1",
      user: {
        userId: "u1",
        nickname: "小明",
        gender: "男",
      },
      failureReason: null,
    });
  });

  it("rejects invalid status filter", async () => {
    await expect(
      service.listMatchingQueue({ status: "bogus" }),
    ).rejects.toThrow(BadRequestException);
  });
});
