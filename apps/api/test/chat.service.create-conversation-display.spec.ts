import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ChatService } from "../src/modules/chat/chat.service";
import * as matchingDisplay from "../src/modules/matching/matching-result-display";

describe("ChatService.createOrReuseConversation (M5.5-Chat-R2A)", () => {
  const summaryStub = {} as any;
  const friendshipStub = {
    assertFriendship: jest.fn(),
    ensureMatchFriends: jest.fn(),
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    friendshipStub.assertFriendship.mockReset();
    friendshipStub.ensureMatchFriends.mockReset();
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
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create,
        update: jest.fn(),
      },
    };

    const svc = new ChatService(prisma as any, summaryStub, friendshipStub as any);
    await svc.createOrReuseConversation("viewer-1", { matchResultId: "mr-1" });

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
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create,
        update: jest.fn(),
      },
    };

    const svc = new ChatService(prisma as any, summaryStub, friendshipStub as any);
    await svc.createOrReuseConversation("viewer-1", { matchResultId: "mr-2" });

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
        findMany: jest.fn().mockResolvedValue([
          {
            id: "existing",
            viewerUserId: "other",
            candidateUserId: "display-b",
            updatedAt: new Date(),
            _count: { messages: 2 },
          },
        ]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update,
      },
    };

    const svc = new ChatService(prisma as any, summaryStub, friendshipStub as any);
    await svc.createOrReuseConversation("viewer-1", { matchResultId: "mr-1" });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "active",
          OR: expect.arrayContaining([
            { viewerUserId: "viewer-1", candidateUserId: "display-b" },
            { viewerUserId: "display-b", candidateUserId: "viewer-1" },
          ]),
        }),
      }),
    );
    expect(update).toHaveBeenCalled();
  });

  it("reuses reverse-direction conversation so both users share one thread", async () => {
    jest.spyOn(matchingDisplay, "resolveMatchResultDisplay").mockResolvedValue({
      displayCandidateUserId: "user-6",
      displaySourceType: "match_result_original",
      finalMatchDecisionMeta: null,
    });

    const update = jest.fn().mockResolvedValue({ id: "shared-conv" });
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "user-6" }) },
      matchResult: {
        findUnique: jest.fn().mockResolvedValue({
          id: "mr-inbound",
          userId: "user-7",
          candidateUserId: "user-6",
          matchInsights: null,
          finalScore: 0.8,
          batchId: "b",
          reasonSummary: null,
          status: "ready",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      conversation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "conv-7-6",
            viewerUserId: "user-7",
            candidateUserId: "user-6",
            updatedAt: new Date(),
            _count: { messages: 3 },
          },
        ]),
        create: jest.fn(),
        update,
      },
    };

    const svc = new ChatService(prisma as any, summaryStub, friendshipStub as any);
    await svc.createOrReuseConversation("user-6", { matchResultId: "mr-inbound" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "conv-7-6" } }),
    );
    expect(prisma.conversation.create).not.toHaveBeenCalled();
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

    const svc = new ChatService(prisma as any, summaryStub, friendshipStub as any);
    await expect(
      svc.createOrReuseConversation("viewer-1", { matchResultId: "mr-x" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws NotFound when matchResultId does not exist", async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "viewer-1" }) },
      matchResult: { findUnique: jest.fn().mockResolvedValue(null) },
      conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const svc = new ChatService(prisma as any, summaryStub, friendshipStub as any);
    await expect(
      svc.createOrReuseConversation("viewer-1", { matchResultId: "missing" }),
    ).rejects.toBeInstanceOf(NotFoundException);
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
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create,
        update: jest.fn(),
      },
    };

    const svc = new ChatService(prisma as any, summaryStub, friendshipStub as any);
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
