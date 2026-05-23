import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { RrmObservedReadonlyService } from "../../src/modules/rrm-observed/rrm-observed-readonly.service";

describe("RrmObservedReadonlyService (M5.1-r6)", () => {
  const baseConversation = {
    id: "conv-1",
    viewerUserId: "viewer-1",
    candidateUserId: "cand-1",
    messages: [
      {
        senderUserId: "viewer-1",
        content: "你好呀",
        createdAt: new Date("2026-05-23T10:00:00.000Z"),
      },
      {
        senderUserId: "cand-1",
        content: "嗨，挺好的",
        createdAt: new Date("2026-05-23T10:01:00.000Z"),
      },
      {
        senderUserId: "viewer-1",
        content: "周末喝咖啡？",
        createdAt: new Date("2026-05-23T10:02:00.000Z"),
      },
      {
        senderUserId: "cand-1",
        content: "可以",
        createdAt: new Date("2026-05-23T10:03:00.000Z"),
      },
      {
        senderUserId: "viewer-1",
        content: "那周六见",
        createdAt: new Date("2026-05-23T10:04:00.000Z"),
      },
      {
        senderUserId: "cand-1",
        content: "好的",
        createdAt: new Date("2026-05-23T10:05:00.000Z"),
      },
    ],
  };

  function serviceWithConversation(row: typeof baseConversation | null) {
    const prisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue(row),
      },
    };
    return {
      svc: new RrmObservedReadonlyService(prisma as any),
      prisma,
    };
  }

  it("returns readonly envelope with applied flags false for participant", async () => {
    const { svc } = serviceWithConversation(baseConversation);
    const out = await svc.getReadonlySummaryForConversation("conv-1", "viewer-1");
    expect(out.mode).toBe("readonly");
    expect(out.appliedToMatchResult).toBe(false);
    expect(out.appliedToFinalScore).toBe(false);
    expect(out.appliedToWorkerRanking).toBe(false);
    expect(out.sourceVersion).toBe("rrm-observed-v1");
    expect(out.participantUserId).toBe("viewer-1");
    expect(out.counterpartyUserId).toBe("cand-1");
    expect(out.observed.insufficientData).toBe(false);
    expect(out.observed).not.toHaveProperty("RFI_obs");
  });

  it("allows candidate participant to request summary from their perspective", async () => {
    const { svc } = serviceWithConversation(baseConversation);
    const out = await svc.getReadonlySummaryForConversation("conv-1", "cand-1");
    expect(out.participantUserId).toBe("cand-1");
    expect(out.counterpartyUserId).toBe("viewer-1");
  });

  it("throws 404 when conversation missing", async () => {
    const { svc } = serviceWithConversation(null);
    await expect(
      svc.getReadonlySummaryForConversation("missing", "viewer-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws 401 when user is not a participant", async () => {
    const { svc } = serviceWithConversation(baseConversation);
    await expect(
      svc.getReadonlySummaryForConversation("conv-1", "stranger"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
