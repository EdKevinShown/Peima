import { HttpException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@peima/database";
import { COPILOT_AI_PROMPT_VERSION } from "./copilot-ai.constants";
import { ChatService } from "../chat/chat.service";
import { CopilotAiConfigService } from "./copilot-ai.config.service";
import { CopilotChatCompletionsClient } from "./copilot-chat-completions.client";
import { mapModelJsonToInsights } from "./copilot-model.mapper";
import { COPILOT_MODEL_SYSTEM_PROMPT } from "./copilot-model.prompt";
import { buildCopilotInsights, type CopilotRuleContext } from "./copilot-rules";
import type { CopilotInsightsResponse } from "./dto/copilot-response.dto";
import { CopilotRepository } from "./copilot.repository";

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly copilotRepo: CopilotRepository,
    private readonly copilotAiConfig: CopilotAiConfigService,
    private readonly copilotChatClient: CopilotChatCompletionsClient,
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

    const ctx: CopilotRuleContext = {
      messageCount: messages.length,
      viewerMsgCount,
      candidateMsgCount,
      summaryBody,
      summaryHint,
      feedbackRatingsThisConv,
      userSignalCountWindow,
      pendingProfileSuggestionsCount,
    };

    const ruleInsights = buildCopilotInsights(conversationId, ctx);

    return this.maybeEnrichWithModel(
      conversationId,
      ctx,
      messages,
      vId,
      cId,
      ruleInsights,
    );
  }

  private buildCopilotModelUserPayload(
    ctx: CopilotRuleContext,
    messages: Array<{ senderUserId: string; content: string | null }>,
    viewerId: string,
    candidateId: string,
  ) {
    const maxSummary = 2000;
    const recent = messages.slice(-12).map((m) => ({
      role:
        m.senderUserId === viewerId
          ? ("me" as const)
          : m.senderUserId === candidateId
            ? ("them" as const)
            : ("other" as const),
      text: (m.content ?? "").slice(0, 240),
    }));
    return {
      messageCount: ctx.messageCount,
      viewerMsgCount: ctx.viewerMsgCount,
      candidateMsgCount: ctx.candidateMsgCount,
      summaryBody: ctx.summaryBody.slice(0, maxSummary),
      summaryHint: ctx.summaryHint.slice(0, maxSummary),
      feedbackRatingsThisConv: ctx.feedbackRatingsThisConv,
      userSignalCountWindow: ctx.userSignalCountWindow,
      pendingProfileSuggestionsCount: ctx.pendingProfileSuggestionsCount,
      recentMessages: recent,
    };
  }

  private async maybeEnrichWithModel(
    conversationId: string,
    ctx: CopilotRuleContext,
    messages: Array<{ senderUserId: string; content: string | null }>,
    viewerId: string,
    candidateId: string,
    ruleInsights: CopilotInsightsResponse,
  ): Promise<CopilotInsightsResponse> {
    if (!this.copilotAiConfig.copilotEnabled) {
      return ruleInsights;
    }
    if (!this.copilotAiConfig.apiKey) {
      this.logger.warn(
        JSON.stringify({
          event: "copilot_ai",
          conversationId,
          outcome: "fallback",
          reason: "missing_api_key",
        }),
      );
      return ruleInsights;
    }

    const userPayload = this.buildCopilotModelUserPayload(
      ctx,
      messages,
      viewerId,
      candidateId,
    );
    const t0 = Date.now();
    const result = await this.copilotChatClient.complete(
      COPILOT_MODEL_SYSTEM_PROMPT,
      JSON.stringify(userPayload),
    );
    const durationMs = Date.now() - t0;

    if (!result.ok) {
      this.logger.warn(
        JSON.stringify({
          event: "copilot_ai",
          conversationId,
          outcome: "fallback",
          reason: result.kind,
          status: result.status,
          detail: result.detail,
          durationMs,
        }),
      );
      return ruleInsights;
    }

    const mapped = mapModelJsonToInsights(conversationId, result.content);
    if (!mapped) {
      this.logger.warn(
        JSON.stringify({
          event: "copilot_ai",
          conversationId,
          outcome: "fallback",
          reason: "invalid_model_payload",
          durationMs,
        }),
      );
      return ruleInsights;
    }

    const slug = this.copilotAiConfig.providerSlug;
    const sourceType = `model_${slug}`;
    const sourceVersion = `${slug}|${this.copilotAiConfig.model}|${COPILOT_AI_PROMPT_VERSION}`;

    this.logger.log(
      JSON.stringify({
        event: "copilot_ai",
        conversationId,
        outcome: "model_ok",
        sourceType,
        durationMs,
      }),
    );

    return {
      conversationId,
      relationshipState: mapped.relationshipState,
      communicationAdvice: mapped.communicationAdvice,
      riskHints: mapped.riskHints,
      suggestedTopics: mapped.suggestedTopics,
      basedOn: ruleInsights.basedOn,
      sourceType,
      sourceVersion,
      generatedAt: new Date().toISOString(),
    };
  }
}
