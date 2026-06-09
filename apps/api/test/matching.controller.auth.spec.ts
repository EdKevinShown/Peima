import { UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MatchingController } from "../src/modules/matching/matching.controller";
import { MatchingDecisionComparisonService } from "../src/modules/matching/matching-decision-comparison.service";
import { MatchingFinalizePairwiseService } from "../src/modules/matching/matching-finalize-pairwise.service";
import { MatchingRrmRankingProposalService } from "../src/modules/matching/matching-rrm-ranking-proposal.service";
import { MatchingService } from "../src/modules/matching/matching.service";

describe("MatchingController auth and delegation", () => {
  async function createController() {
    const matchingService = {
      enqueue: jest.fn().mockResolvedValue({ id: "q1", status: "waiting" }),
      getStatusForUser: jest.fn().mockResolvedValue({
        status: "ready",
        userMessage: "匹配已完成，正在为你打开结果…",
      }),
      getLatestResultForUser: jest.fn().mockResolvedValue({
        id: "mr-1",
        userId: "u1",
        candidateUserId: "c1",
        status: "ready",
      }),
    };
    const mod = await Test.createTestingModule({
      controllers: [MatchingController],
      providers: [
        { provide: MatchingService, useValue: matchingService },
        { provide: MatchingFinalizePairwiseService, useValue: {} },
        { provide: MatchingRrmRankingProposalService, useValue: {} },
        { provide: MatchingDecisionComparisonService, useValue: {} },
      ],
    }).compile();
    return {
      controller: mod.get(MatchingController),
      matchingService,
    };
  }

  it("enqueue rejects userId mismatch", async () => {
    const { controller } = await createController();
    expect(() =>
      controller.enqueue({ userId: "other" } as never, {
        user: { userId: "u1" },
      } as never),
    ).toThrow(UnauthorizedException);
  });

  it("enqueue delegates when token user matches body", async () => {
    const { controller, matchingService } = await createController();
    await controller.enqueue({ userId: "u1" } as never, {
      user: { userId: "u1" },
    } as never);
    expect(matchingService.enqueue).toHaveBeenCalledWith({ userId: "u1" });
  });

  it("getStatus rejects userId mismatch", async () => {
    const { controller } = await createController();
    expect(() =>
      controller.getStatus("other", { user: { userId: "u1" } } as never),
    ).toThrow(UnauthorizedException);
  });

  it("getResult delegates for matching token user", async () => {
    const { controller, matchingService } = await createController();
    const out = await controller.getResult("u1", {
      user: { userId: "u1" },
    } as never);
    expect(matchingService.getLatestResultForUser).toHaveBeenCalledWith("u1");
    expect(out).toMatchObject({ id: "mr-1", status: "ready" });
  });
});
