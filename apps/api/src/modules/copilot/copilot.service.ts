import { HttpException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@peima/database";
import { ChatService } from "../chat/chat.service";
import { buildCopilotInsights } from "./copilot-rules";
import type { CopilotInsightsResponse } from "./dto/copilot-response.dto";
import { CopilotRepository } from "./copilot.repository";

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);

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
    let conversation: Awaited<
      ReturnType<ChatService["getConversationWithMessages"]>
    >;
    try {
      conversation = await this.chatService.getConversationWithMessages(
        conversationId,
        tokenUserId,
      );
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        this.logger.warn(
          `Copilot: Prisma ${e.code} loading conversation ${conversationId} — returning minimal insights`,
        );
        return buildCopilotInsights(conversationId, {
          messageCount: 0,
          viewerMsgCount: 0,
          candidateMsgCount: 0,
          summaryBody: "",
          summaryHint: "",
          feedbackRatingsThisConv: [],
          userSignalCountWindow: 0,
          pendingProfileSuggestionsCount: 0,
        });
      }
      throw e;
    }

    let summaryBody = "";
    let summaryHint = "";
    try {
      const summary = await this.chatService.getConversationSummaryPlaceholder(
        conversationId,
        tokenUserId,
      );
      summaryBody = summary.summary;
      summaryHint = summary.chatStageHint ?? "";
    } catch (err) {
      this.logger.warn(
        `Copilot: summary unavailable for ${conversationId}: ${String(err)}`,
      );
    }

    const messages = conversation.messages ?? [];
    const vId = conversation.viewerUserId;
    const cId = conversation.candidateUserId;
    let viewerMsgCount = 0;
    let candidateMsgCount = 0;
    for (const m of messages) {
      if (m.senderUserId === vId) viewerMsgCount++;
      else if (m.senderUserId === cId) candidateMsgCount++;
    }

    const since = this.copilotRepo.signalWindowStart();

    const agg = await Promise.allSettled([
      this.copilotRepo.findFeedbackRatingsForConversation(
        tokenUserId,
        conversationId,
        10,
      ),
      this.copilotRepo.countUserBehaviorSignalsSince(tokenUserId, since),
      this.copilotRepo.countPendingProfileSuggestions(tokenUserId),
    ]);

    const feedbackRows = agg[0].status === "fulfilled" ? agg[0].value : [];
    const userSignalCountWindow = agg[1].status === "fulfilled" ? agg[1].value : 0;
    const pendingProfileSuggestionsCount =
      agg[2].status === "fulfilled" ? agg[2].value : 0;

    agg.forEach((r, i) => {
      if (r.status === "rejected") {
        this.logger.warn(
          `Copilot: aggregate query ${i} failed: ${String(r.reason)}`,
        );
      }
    });

    const feedbackRatingsThisConv = feedbackRows
      .map((r) => r.rating)
      .filter((r): r is number => r !== null && r !== undefined);

    return buildCopilotInsights(conversationId, {
      messageCount: messages.length,
      viewerMsgCount,
      candidateMsgCount,
      summaryBody,
      summaryHint,
      feedbackRatingsThisConv,
      userSignalCountWindow,
      pendingProfileSuggestionsCount,
    });
  }
}
