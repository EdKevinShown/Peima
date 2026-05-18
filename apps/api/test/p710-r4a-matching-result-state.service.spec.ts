import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { MatchingService } from "../src/modules/matching/matching.service";
import { P76_RESULT_STATE_CONTRACT_VERSION } from "../src/modules/matching/matching-result-state";

const USER_ID = "user-r4a-test";

function matchRow() {
  return {
    id: "mr-r4a",
    userId: USER_ID,
    candidateUserId: "cand-1",
    batchId: "batch-1",
    finalScore: 0.8,
    reasonSummary: "ok",
    matchInsights: {},
    status: "ready",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
  };
}

describe("MatchingService P7.10-r4a resultState contract", () => {
  const prevEnv = { ...process.env };
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
      user: { findUnique: jest.fn().mockResolvedValue({ id: USER_ID }) },
      matchResult: { findFirst: jest.fn() },
      batchMatchQueue: { findFirst: jest.fn() },
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
    delete process.env.PEIMA_P76_READ_PATH_ENABLED;
    delete process.env.PEIMA_P76_READ_PATH_VIEWER_IDS;
    delete process.env.PAIRWISE_FINAL_MATCH_ENABLED;
    delete process.env.PEIMA_M5_RRM_TOP2_ENABLED;
    delete process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED;
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it("flag off + no row → NotFoundException (unchanged)", async () => {
    delete process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED;
    prisma.matchResult.findFirst.mockResolvedValue(null);
    await expect(service.getLatestResultForUser(USER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("flag on + no row + not_queued → no_result typed 200 body", async () => {
    process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED = "1";
    prisma.matchResult.findFirst.mockResolvedValue(null);
    prisma.batchMatchQueue.findFirst.mockResolvedValue(null);

    const r = await service.getLatestResultForUser(USER_ID);
    expect(r).toMatchObject({
      resultState: "no_result",
      contractVersion: P76_RESULT_STATE_CONTRACT_VERSION,
      queue: { status: "not_queued" },
    });
    expect("id" in r).toBe(false);
  });

  it("flag on + no row + waiting queue → matching_pending", async () => {
    process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED = "1";
    prisma.matchResult.findFirst.mockResolvedValue(null);
    prisma.batchMatchQueue.findFirst.mockResolvedValue({
      id: "q1",
      userId: USER_ID,
      status: "waiting",
    });

    const r = await service.getLatestResultForUser(USER_ID);
    expect(r).toMatchObject({
      resultState: "matching_pending",
      contractVersion: P76_RESULT_STATE_CONTRACT_VERSION,
      queue: { status: "waiting" },
    });
  });

  it("flag on + row → additive resultState on full payload", async () => {
    process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED = "1";
    prisma.matchResult.findFirst.mockResolvedValue(matchRow());

    const r = await service.getLatestResultForUser(USER_ID);
    expect("id" in r && r.id === "mr-r4a").toBe(true);
    expect(r).toMatchObject({
      resultState: "ready",
      contractVersion: P76_RESULT_STATE_CONTRACT_VERSION,
      displaySourceType: "match_result_original",
    });
  });

  it("flag off + row → no resultState fields", async () => {
    delete process.env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED;
    prisma.matchResult.findFirst.mockResolvedValue(matchRow());

    const r = await service.getLatestResultForUser(USER_ID);
    expect("id" in r).toBe(true);
    expect("resultState" in r).toBe(false);
    expect("contractVersion" in r).toBe(false);
  });
});
