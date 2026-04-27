import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { MatchResult } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MatchExplanationAiChatCompletionsClient } from "./match-explanation-ai-chat-completions.client";
import { MatchExplanationAiConfigService } from "./match-explanation-ai.config.service";
import {
  MATCH_EXPLANATION_AI_LOG_EVENT,
  MATCH_EXPLANATION_PROMPT_VERSION,
  MATCH_EXPLANATION_RULE_SOURCE_VERSION,
} from "./match-explanation-ai.constants";
import { buildChatProfileOverlaySummaryForPrompt } from "./match-explanation-chat-overlay-summary";
import {
  buildMatchExplanationUserContent,
  MATCH_EXPLANATION_AI_SYSTEM_PROMPT,
} from "./match-explanation-ai-model.prompt";
import { mapModelJsonToMatchExplanation } from "./match-explanation-ai-model.mapper";
import type { MatchExplanationAiResponseDto } from "./dto/match-explanation-ai-response.dto";

@Injectable()
export class MatchExplanationAiService {
  private readonly logger = new Logger(MatchExplanationAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiConfig: MatchExplanationAiConfigService,
    private readonly chatClient: MatchExplanationAiChatCompletionsClient,
  ) {}

  private buildRuleResponse(row: MatchResult): MatchExplanationAiResponseDto {
    const score = row.finalScore != null ? String(row.finalScore) : "—";
    const rs = row.reasonSummary?.trim() || "（系统未提供文字摘要）";
    const explanationText =
      `当前为规则占位说明（非大模型）。候选用户 ID：${row.candidateUserId}；综合得分：${score}；状态：${row.status}。系统摘要：${rs}。说明仅基于已有匹配结果字段复述，不改变匹配决策。`;
    return {
      explanationText,
      generatedAt: new Date().toISOString(),
      sourceType: "match_explanation_rule_based",
      sourceVersion: MATCH_EXPLANATION_RULE_SOURCE_VERSION,
    };
  }

  async getExplanation(
    matchResultId: string,
    tokenUserId: string,
  ): Promise<MatchExplanationAiResponseDto> {
    const mid = matchResultId.trim();
    const t0 = Date.now();

    const row = await this.prisma.matchResult.findUnique({
      where: { id: mid },
    });

    if (!row) {
      throw new NotFoundException(`Match result ${mid} not found`);
    }

    if (row.userId !== tokenUserId) {
      throw new UnauthorizedException("match result not accessible by this user");
    }

    const ruleResponse = (): MatchExplanationAiResponseDto =>
      this.buildRuleResponse(row);

    if (!this.aiConfig.matchExplanationAiEnabled) {
      this.logger.warn(
        JSON.stringify({
          event: MATCH_EXPLANATION_AI_LOG_EVENT,
          matchResultId: mid,
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
          event: MATCH_EXPLANATION_AI_LOG_EVENT,
          matchResultId: mid,
          outcome: "fallback",
          reason: "missing_api_key",
          durationMs: Date.now() - t0,
          providerSlug: this.aiConfig.providerSlug,
        }),
      );
      return ruleResponse();
    }

    let chatProfileOverlaySummary: string | null = null;
    try {
      const prof = await this.prisma.userProfile.findUnique({
        where: { userId: row.userId },
        select: { effectiveProfileChatOverlayV1: true },
      });
      chatProfileOverlaySummary = buildChatProfileOverlaySummaryForPrompt(
        prof?.effectiveProfileChatOverlayV1 ?? null,
      );
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          event: MATCH_EXPLANATION_AI_LOG_EVENT,
          matchResultId: mid,
          outcome: "overlay_summary_skipped",
          reason: "profile_read_failed",
          detail: String(err).slice(0, 300),
        }),
      );
      chatProfileOverlaySummary = null;
    }

    const userContent = buildMatchExplanationUserContent(row, {
      chatProfileOverlaySummary,
    });
    const result = await this.chatClient.complete(
      MATCH_EXPLANATION_AI_SYSTEM_PROMPT,
      userContent,
    );
    const durationMs = Date.now() - t0;

    if (!result.ok) {
      this.logger.warn(
        JSON.stringify({
          event: MATCH_EXPLANATION_AI_LOG_EVENT,
          matchResultId: mid,
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

    const mapped = mapModelJsonToMatchExplanation(mid, result.content);
    if (!mapped) {
      this.logger.warn(
        JSON.stringify({
          event: MATCH_EXPLANATION_AI_LOG_EVENT,
          matchResultId: mid,
          outcome: "fallback",
          reason: "invalid_model_payload",
          durationMs,
          providerSlug: this.aiConfig.providerSlug,
        }),
      );
      return ruleResponse();
    }

    const slug = this.aiConfig.providerSlug;
    const sourceType = `match_explanation_model_${slug}`;
    const sourceVersion = `${slug}|${this.aiConfig.model}|${MATCH_EXPLANATION_PROMPT_VERSION}`;

    this.logger.log(
      JSON.stringify({
        event: MATCH_EXPLANATION_AI_LOG_EVENT,
        matchResultId: mid,
        outcome: "model_ok",
        durationMs,
        providerSlug: slug,
      }),
    );

    return {
      explanationText: mapped.explanationText,
      generatedAt: new Date().toISOString(),
      sourceType,
      sourceVersion,
    };
  }
}
