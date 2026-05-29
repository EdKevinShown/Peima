import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ChatService } from "../src/modules/chat/chat.service";
import * as matchingDisplay from "../src/modules/matching/matching-result-display";

describe("ChatService.createOrReuseConversation (M5.5-Chat-R2A)", () => {
  const summaryStub = {} as any;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("uses resolveMatchResultDisplay displayCandidateUserId when matchResultId is provided", async () => {
    jest.spyOn(matchingDisplay, "resolveMatchResultDisplay").mockResolvedValue({
      displayCandidateUserId: "display-b",
      displaySourceType: "rrm_top2_bounded_selector",
      finalMatchDecisionMeta: null,
    });

    const create = jest.fn().mockResolvedValue({ id: "c1" });
    const matchResultUpdate = jest.fn();
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "viewer-1" }) },
      matchResult: {
        findUnique: jest.fn().mockResolvedValue({
          id: "mr-1",
          userId: "viewer-1",
          candidateUserId: "baseline-a",
          matchInsights: null,
          finalScore: 0.9,
          batchId: "b",
          reasonSummary: null,
          status: "ready",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: matchResultUpdate,
      },
      conversation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
        update: jest.fn(),
      },
    };

    const svc = new ChatService(prisma as any, summaryStub);
    await svc.createOrReuseConversation("viewer-1", "mr-1");

    expect(create).toHaveBeenCalledWith({
      data: {
        viewerUserId: "viewer-1",
        candidateUserId: "display-b",
        matchResultId: "mr-1",
        status: "active",
      },
    });
    expect(matchResultUpdate).not.toHaveBeenCalled();
  });

  it("falls back to candidateUserId when display candidate is empty after trim", async () => {
    jest.spyOn(matchingDisplay, "resolveMatchResultDisplay").mockResolvedValue({
      displayCandidateUserId: "",
      displaySourceType: "match_result_original",
      finalMatchDecisionMeta: null,
    });

    const create = jest.fn().mockResolvedValue({ id: "c-fb" });
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "viewer-1" }) },
      matchResult: {
        findUnique: jest.fn().mockResolvedValue({
          id: "mr-2",
          userId: "viewer-1",
          candidateUserId: "only-baseline",
          matchInsights: null,
          finalScore: 0.5,
          batchId: "b",
          reasonSummary: null,
          status: "ready",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: jest.fn(),
      },
      conversation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
        update: jest.fn(),
      },
    };

    const svc = new ChatService(prisma as any, summaryStub);
    await svc.createOrReuseConversation("viewer-1", "mr-2");

    expect(create).toHaveBeenCalledWith({
      data: {
        viewerUserId: "viewer-1",
        candidateUserId: "only-baseline",
        matchResultId: "mr-2",
        status: "active",
      },
    });
  });

  it("reuses conversation keyed by display candidate, not baseline", async () => {
    jest.spyOn(matchingDisplay, "resolveMatchResultDisplay").mockResolvedValue({
      displayCandidateUserId: "display-b",
      displaySourceType: "rrm_top2_bounded_selector",
      finalMatchDecisionMeta: null,
    });

    const update = jest.fn().mockResolvedValue({ id: "existing" });
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "viewer-1" }) },
      matchResult: {
        findUnique: jest.fn().mockResolvedValue({
          id: "mr-1",
          userId: "viewer-1",
          candidateUserId: "baseline-a",
          matchInsights: null,
          finalScore: 0.9,
          batchId: "b",
          reasonSummary: null,
          status: "ready",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      conversation: {
        findFirst: jest.fn().mockResolvedValue({ id: "existing" }),
        create: jest.fn(),
        update,
      },
    };

    const svc = new ChatService(prisma as any, summaryStub);
    await svc.createOrReuseConversation("viewer-1", "mr-1");

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          viewerUserId: "viewer-1",
          candidateUserId: "display-b",
          status: "active",
        }),
      }),
    );
    expect(update).toHaveBeenCalled();
  });

  it("throws Forbidden when matchResult belongs to another user", async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "viewer-1" }) },
      matchResult: {
        findUnique: jest.fn().mockResolvedValue({
          id: "mr-x",
          userId: "other-user",
          candidateUserId: "baseline-a",
        }),
      },
      conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const svc = new ChatService(prisma as any, summaryStub);
    await expect(svc.createOrReuseConversation("viewer-1", "mr-x")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws NotFound when matchResultId does not exist", async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "viewer-1" }) },
      matchResult: { findUnique: jest.fn().mockResolvedValue(null) },
      conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const svc = new ChatService(prisma as any, summaryStub);
    await expect(svc.createOrReuseConversation("viewer-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("without matchResultId uses latest MatchResult.candidateUserId (legacy)", async () => {
    jest.spyOn(matchingDisplay, "resolveMatchResultDisplay");

    const create = jest.fn().mockResolvedValue({ id: "c2" });
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "viewer-1" }) },
      matchResult: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          id: "latest-mr",
          candidateUserId: "legacy-cand",
        }),
      },
      conversation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
        update: jest.fn(),
      },
    };

    const svc = new ChatService(prisma as any, summaryStub);
    await svc.createOrReuseConversation("viewer-1");

    expect(matchingDisplay.resolveMatchResultDisplay).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: {
        viewerUserId: "viewer-1",
        candidateUserId: "legacy-cand",
        matchResultId: "latest-mr",
        status: "active",
      },
    });
  });
});
