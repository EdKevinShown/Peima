import { Injectable } from "@nestjs/common";
import { ChatService } from "../chat/chat.service";
import { buildCopilotInsights } from "./copilot-rules";
import type { CopilotInsightsResponse } from "./dto/copilot-response.dto";
import { CopilotRepository } from "./copilot.repository";

@Injectable()
export class CopilotService {
  constructor(
    private readonly chatService: ChatService,
    private readonly copilotRepo: CopilotRepository,
  ) {}

  /**
   * Read-only Copilot layer: aggregates summary + feedback + signals + pending suggestions.
   * Never writes messages, suggestions, or signals.
   */
  async getConversationInsights(
    conversationId: string,
    tokenUserId: string,
  ): Promise<CopilotInsightsResponse> {
    const conversation = await this.chatService.getConversationWithMessages(
      conversationId,
      tokenUserId,
    );

    const summary = await this.chatService.getConversationSummaryPlaceholder(
      conversationId,
      tokenUserId,
    );

    const vId = conversation.viewerUserId;
    const cId = conversation.candidateUserId;
    let viewerMsgCount = 0;
    let candidateMsgCount = 0;
    for (const m of conversation.messages) {
      if (m.senderUserId === vId) viewerMsgCount++;
      else if (m.senderUserId === cId) candidateMsgCount++;
    }

    const since = this.copilotRepo.signalWindowStart();

    const [feedbackRows, userSignalCountWindow, pendingProfileSuggestionsCount] =
      await Promise.all([
        this.copilotRepo.findFeedbackRatingsForConversation(
          tokenUserId,
          conversationId,
          10,
        ),
        this.copilotRepo.countUserBehaviorSignalsSince(tokenUserId, since),
        this.copilotRepo.countPendingProfileSuggestions(tokenUserId),
      ]);

    const feedbackRatingsThisConv = feedbackRows
      .map((r) => r.rating)
      .filter((r): r is number => r !== null && r !== undefined);

    return buildCopilotInsights(conversationId, {
      messageCount: conversation.messages.length,
      viewerMsgCount,
      candidateMsgCount,
      summaryBody: summary.summary,
      summaryHint: summary.chatStageHint,
      feedbackRatingsThisConv,
      userSignalCountWindow,
      pendingProfileSuggestionsCount,
    });
  }
}
