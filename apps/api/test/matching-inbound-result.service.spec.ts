import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { MatchingService } from "../src/modules/matching/matching.service";

const USER_6 = "user-6";
const USER_7 = "user-7";

describe("MatchingService inbound match visibility", () => {
  let service: MatchingService;
  let prisma: {
    user: { findUnique: jest.Mock };
    matchResult: { findFirst: jest.Mock };
    batchMatchQueue: { findFirst: jest.Mock };
    userProfile: { findUnique: jest.Mock };
    matchResultRrmTop2DisplayMeta: { findUnique: jest.Mock };
    pairwisePoolFinalizeMeta: { findFirst: jest.Mock };
    p76AllowlistApplyMeta: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: USER_6 }) },
      matchResult: { findFirst: jest.fn() },
      batchMatchQueue: { findFirst: jest.fn().mockResolvedValue(null) },
      userProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      matchResultRrmTop2DisplayMeta: { findUnique: jest.fn().mockResolvedValue(null) },
      pairwisePoolFinalizeMeta: { findFirst: jest.fn().mockResolvedValue(null) },
      p76AllowlistApplyMeta: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(MatchingService);
    delete process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED;
  });

  it("returns user-7 as candidate when user-6 only appears as inbound match", async () => {
    prisma.matchResult.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "mr-7-to-6",
        userId: USER_7,
        candidateUserId: USER_6,
        batchId: "batch-1",
        finalScore: 0.82,
        reasonSummary:
          "Selected by finalScore v1 (previewPoolScore=0.8, preferenceScore=1, styleScore=1, profileScore=0.82).",
        matchInsights: {},
        status: "ready",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const r = await service.getLatestResultForUser(USER_6);
    expect("candidateUserId" in r && r.candidateUserId).toBe(USER_7);
    expect("userId" in r && r.userId).toBe(USER_6);
  });
});
