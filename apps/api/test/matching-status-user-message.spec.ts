import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { MatchingService } from "../src/modules/matching/matching.service";
import { userMessageForQueueStatus } from "../src/modules/matching/matching-user-messages";

const USER_ID = "user-status-msg-test";

describe("MatchingService status userMessage", () => {
  let service: MatchingService;
  let prisma: {
    user: { findUnique: jest.Mock };
    matchResult: { findFirst: jest.Mock };
    batchMatchQueue: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    userProfile: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: USER_ID }) },
      matchResult: { findFirst: jest.fn().mockResolvedValue(null) },
      batchMatchQueue: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      userProfile: { findUnique: jest.fn().mockResolvedValue({ userId: USER_ID }) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(MatchingService);
  });

  it("getStatusForUser: not_queued includes userMessage", async () => {
    const payload = await service.getStatusForUser(USER_ID);
    expect(payload.status).toBe("not_queued");
    expect(payload.userMessage).toBe(userMessageForQueueStatus("not_queued"));
  });

  it("getStatusForUser: failed queue surfaces failed status + userMessage", async () => {
    prisma.batchMatchQueue.findFirst.mockResolvedValue({
      id: "q-fail",
      userId: USER_ID,
      status: "failed",
      createdAt: new Date(),
    });
    const payload = await service.getStatusForUser(USER_ID);
    expect(payload.status).toBe("failed");
    expect(payload.userMessage).toBe(userMessageForQueueStatus("failed"));
  });

  it("enqueue: returns userMessage and alreadyQueued", async () => {
    prisma.batchMatchQueue.findFirst.mockResolvedValue(null);
    prisma.batchMatchQueue.create.mockResolvedValue({
      id: "q-new",
      userId: USER_ID,
      status: "waiting",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await service.enqueue({ userId: USER_ID });
    expect(res.alreadyQueued).toBe(false);
    expect(res.userMessage).toContain("已加入匹配队列");
  });
});
