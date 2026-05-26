import { UnauthorizedException } from "@nestjs/common";
import { ChatController } from "../src/modules/chat/chat.controller";

describe("ChatController RRM readonly endpoints", () => {
  function createController() {
    const chatService = {};
    const observed = {
      getReadonlySummaryForConversation: jest.fn().mockResolvedValue({
        sourceVersion: "rrm-observed-v1",
        appliedToMatchResult: false,
      }),
    };
    const assistant = {
      assessDraftForConversation: jest.fn().mockResolvedValue({
        sourceVersion: "rrm-assistant-v1",
        appliedToMatchResult: false,
      }),
    };
    const timeline = {
      getReadonlySummaryForConversation: jest.fn().mockResolvedValue({
        sourceVersion: "rrm-timeline-v1",
        appliedToMatchResult: false,
      }),
    };
    const profileCompletion = {};
    const controller = new ChatController(
      chatService as never,
      observed as never,
      assistant as never,
      timeline as never,
      profileCompletion as never,
    );
    return { controller, observed, assistant, timeline };
  }

  it("delegates observed summary with JWT participant id", async () => {
    const { controller, observed } = createController();
    const out = await controller.getRrmObservedSummary(
      "conv-1",
      { user: { userId: "user-1" } } as never,
    );

    expect(observed.getReadonlySummaryForConversation).toHaveBeenCalledWith(
      "conv-1",
      "user-1",
    );
    expect(out).toMatchObject({
      sourceVersion: "rrm-observed-v1",
      appliedToMatchResult: false,
    });
  });

  it("delegates assistant draft assessment with draft body", async () => {
    const { controller, assistant } = createController();
    const out = await controller.assessRrmAssistantDraft(
      "conv-1",
      { draft: "周末有空一起喝咖啡吗？" },
      { user: { userId: "user-1" } } as never,
    );

    expect(assistant.assessDraftForConversation).toHaveBeenCalledWith(
      "conv-1",
      "user-1",
      "周末有空一起喝咖啡吗？",
    );
    expect(out).toMatchObject({
      sourceVersion: "rrm-assistant-v1",
      appliedToMatchResult: false,
    });
  });

  it("delegates timeline summary with JWT participant id", async () => {
    const { controller, timeline } = createController();
    const out = await controller.getRrmTimelineSummary(
      "conv-1",
      { user: { userId: "user-1" } } as never,
    );

    expect(timeline.getReadonlySummaryForConversation).toHaveBeenCalledWith(
      "conv-1",
      "user-1",
    );
    expect(out).toMatchObject({
      sourceVersion: "rrm-timeline-v1",
      appliedToMatchResult: false,
    });
  });

  it("rejects RRM readonly endpoints without authenticated user", async () => {
    const { controller } = createController();
    expect(() =>
      controller.getRrmObservedSummary("conv-1", { user: {} } as never),
    ).toThrow(UnauthorizedException);
    expect(() =>
      controller.assessRrmAssistantDraft("conv-1", { draft: "hi" }, { user: {} } as never),
    ).toThrow(UnauthorizedException);
    expect(() =>
      controller.getRrmTimelineSummary("conv-1", { user: {} } as never),
    ).toThrow(UnauthorizedException);
  });
});
