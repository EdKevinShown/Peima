import { Injectable, Logger } from "@nestjs/common";
import { ChatService } from "../chat/chat.service";
import { ChatSummaryService } from "../chat/chat-summary.service";
import { SummaryAiChatCompletionsClient } from "./summary-ai-chat-completions.client";
import { SummaryAiConfigService } from "./summary-ai.config.service";
import {
  SUMMARY_AI_LOG_EVENT,
  SUMMARY_PROMPT_VERSION,
  SUMMARY_RULE_SOURCE_VERSION,
} from "./summary-ai.constants";
import { buildSummaryUserContent, SUMMARY_AI_SYSTEM_PROMPT } from "./summary-ai-model.prompt";
import { mapModelJsonToSummary } from "./summary-ai-model.mapper";
import type { SummaryAiResponseDto } from "./dto/summary-ai-response.dto";

@Injectable()
export class SummaryAiService {
  private readonly logger = new Logger(SummaryAiService.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly chatSummaryService: ChatSummaryService,
    private readonly aiConfig: SummaryAiConfigService,
    private readonly chatClient: SummaryAiChatCompletionsClient,
  ) {}

  async getAiSummary(
    conversationId: string,
    tokenUserId: string,
  ): Promise<SummaryAiResponseDto> {
    const cid = conversationId.trim();
    const t0 = Date.now();

    const conversation = await this.chatService.getConversationWithMessages(
      cid,
      tokenUserId,
    );
    const rule = this.chatSummaryService.computeRuleBasedSummary(conversation);

    const ruleResponse = (): SummaryAiResponseDto => ({
      summary: rule.summary,
      chatStageHint: rule.chatStageHint,
      generatedAt: new Date().toISOString(),
      sourceType: "summary_rule_based",
      sourceVersion: SUMMARY_RULE_SOURCE_VERSION,
    });

    if (!this.aiConfig.summaryAiEnabled) {
      this.logger.warn(
        JSON.stringify({
          event: SUMMARY_AI_LOG_EVENT,
          conversationId: cid,
          outcome: "fallback",
          reason: "disabled",
          durationMs: Date.now() - t0,
          providerSlug: this.aiConfig.providerSlug,
        }),
      );
      return ruleResponse();
    }

    if (!this.aiConfig.apiKey) {
      this.logger.warn(
        JSON.stringify({
          event: SUMMARY_AI_LOG_EVENT,
          conversationId: cid,
          outcome: "fallback",
          reason: "missing_api_key",
          durationMs: Date.now() - t0,
          providerSlug: this.aiConfig.providerSlug,
        }),
      );
      return ruleResponse();
    }

    const userContent = buildSummaryUserContent(cid, conversation);
    const result = await this.chatClient.complete(
      SUMMARY_AI_SYSTEM_PROMPT,
      userContent,
    );
    const durationMs = Date.now() - t0;

    if (!result.ok) {
      this.logger.warn(
        JSON.stringify({
          event: SUMMARY_AI_LOG_EVENT,
          conversationId: cid,
          outcome: "fallback",
          reason: result.kind,
          durationMs,
          providerSlug: this.aiConfig.providerSlug,
          ...(result.status !== undefined ? { status: result.status } : {}),
          ...(result.detail
            ? { detail: result.detail.slice(0, 500) }
            : {}),
        }),
      );
      return ruleResponse();
    }

    const mapped = mapModelJsonToSummary(cid, result.content);
    if (!mapped) {
      this.logger.warn(
        JSON.stringify({
          event: SUMMARY_AI_LOG_EVENT,
          conversationId: cid,
          outcome: "fallback",
          reason: "invalid_model_payload",
          durationMs,
          providerSlug: this.aiConfig.providerSlug,
        }),
      );
      return ruleResponse();
    }

    const slug = this.aiConfig.providerSlug;
    const sourceType = `summary_model_${slug}`;
    const sourceVersion = `${slug}|${this.aiConfig.model}|${SUMMARY_PROMPT_VERSION}`;

    this.logger.log(
      JSON.stringify({
        event: SUMMARY_AI_LOG_EVENT,
        conversationId: cid,
        outcome: "model_ok",
        durationMs,
        providerSlug: slug,
      }),
    );

    return {
      summary: mapped.summary,
      chatStageHint: mapped.chatStageHint,
      generatedAt: new Date().toISOString(),
      sourceType,
      sourceVersion,
    };
  }
}
