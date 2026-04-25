import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { MatchingService } from "../matching/matching.service";
import { QuestionnaireService } from "../questionnaire/questionnaire.service";
import { MatchReviewAiChatCompletionsClient } from "./match-review-ai-chat-completions.client";
import { MatchReviewAiConfigService } from "./match-review-ai.config.service";
import {
  MATCH_REVIEW_AI_LOG_EVENT,
  MATCH_REVIEW_PROMPT_VERSION,
  MATCH_REVIEW_RULE_SOURCE_VERSION,
} from "./match-review-ai.constants";
import {
  buildMatchReviewUserContent,
  MATCH_REVIEW_AI_SYSTEM_PROMPT,
} from "./match-review-ai-model.prompt";
import { mapModelJsonToAiMatchReview } from "./match-review-ai-model.mapper";
import { buildRuleAiMatchReview } from "./match-review-ai-rule";
import { buildMatchReviewStaticSummary } from "./match-review-static-summary";
import type { MatchReviewResponseDto } from "./match-review-ai.types";

function mapFailureKindToReason(
  kind: string,
): NonNullable<MatchReviewResponseDto["debug"]["meta"]>["reason"] {
  if (kind === "disabled") return "disabled";
  if (kind === "missing_api_key") return "missing_config";
  if (kind === "timeout") return "timeout";
  if (kind === "http") return "http_error";
  if (kind === "invalid_json_response" || kind === "empty_content") {
    return "invalid_json";
  }
  if (kind === "network") return "unknown";
  return "unknown";
}

@Injectable()
export class MatchReviewAiService {
  private readonly logger = new Logger(MatchReviewAiService.name);

  constructor(
    private readonly matchingService: MatchingService,
    private readonly questionnaireService: QuestionnaireService,
    private readonly aiConfig: MatchReviewAiConfigService,
    private readonly chatClient: MatchReviewAiChatCompletionsClient,
  ) {}

  async review(
    tokenUserId: string,
    candidateUserId: string,
  ): Promise<MatchReviewResponseDto> {
    const t0 = Date.now();
    const cid = candidateUserId.trim();

    const matchRow = await this.matchingService.getLatestResultForUser(
      tokenUserId,
    );
    if (matchRow.candidateUserId !== cid) {
      throw new ForbiddenException(
        "candidateUserId does not match your latest match result",
      );
    }

    let viewerProfileView;
    try {
      viewerProfileView =
        await this.questionnaireService.getProfileForUser(tokenUserId);
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new NotFoundException(
          "questionnaire profile missing for viewer (current account): complete the questionnaire for the logged-in user, or use an account that has a user_profiles row",
        );
      }
      throw e;
    }
    let candidateProfileView;
    try {
      candidateProfileView =
        await this.questionnaireService.getProfileForUser(cid);
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new NotFoundException(
          "questionnaire profile missing for matched candidate: the latest match points to a user without a questionnaire-derived profile; regenerate preview pool (candidates need image + profile) and run batch match again",
        );
      }
      throw e;
    }

    const { reviewStaticScore, staticSummary } = buildMatchReviewStaticSummary(
      viewerProfileView,
      candidateProfileView,
    );

    const ruleReview = () => buildRuleAiMatchReview(reviewStaticScore, staticSummary);

    const buildDebug = (
      sourceType: string,
      sourceVersion: string,
      fallbackUsed: boolean,
      meta?: MatchReviewResponseDto["debug"]["meta"],
    ): MatchReviewResponseDto["debug"] => ({
      matchResultFinalScore: matchRow.finalScore ?? null,
      sourceType,
      sourceVersion,
      fallbackUsed,
      meta,
    });

    const ruleOnlyResponse = (
      reason: NonNullable<MatchReviewResponseDto["debug"]["meta"]>["reason"],
    ): MatchReviewResponseDto => {
      this.logger.warn(
        JSON.stringify({
          event: MATCH_REVIEW_AI_LOG_EVENT,
          matchResultId: matchRow.id,
          outcome: "rule_only",
          reason,
          durationMs: Date.now() - t0,
          providerSlug: this.aiConfig.providerSlug,
        }),
      );
      return {
        viewerUserId: tokenUserId,
        candidateUserId: cid,
        matchResultId: matchRow.id,
        reviewStaticScore,
        staticSummary,
        aiReview: ruleReview(),
        debug: buildDebug(
          "match_review_rule_based",
          MATCH_REVIEW_RULE_SOURCE_VERSION,
          false,
          { reason, provider: this.aiConfig.providerSlug, model: this.aiConfig.model },
        ),
      };
    };

    if (!this.aiConfig.matchReviewAiEnabled) {
      return ruleOnlyResponse("disabled");
    }
    if (!this.aiConfig.apiKey) {
      return ruleOnlyResponse("missing_config");
    }

    const userContent = buildMatchReviewUserContent({
      viewerUserId: tokenUserId,
      candidateUserId: cid,
      matchResultId: matchRow.id,
      reviewStaticScore,
      staticSummary,
      viewerOverall: viewerProfileView.overallExplanation,
      candidateOverall: candidateProfileView.overallExplanation,
    });

    const result = await this.chatClient.complete(
      MATCH_REVIEW_AI_SYSTEM_PROMPT,
      userContent,
    );
    const durationMs = Date.now() - t0;

    if (!result.ok) {
      const reason = mapFailureKindToReason(result.kind);
      this.logger.warn(
        JSON.stringify({
          event: MATCH_REVIEW_AI_LOG_EVENT,
          matchResultId: matchRow.id,
          outcome: "fallback",
          reason: result.kind,
          mappedReason: reason,
          durationMs,
          providerSlug: this.aiConfig.providerSlug,
          ...(result.status !== undefined ? { status: result.status } : {}),
        }),
      );
      return {
        viewerUserId: tokenUserId,
        candidateUserId: cid,
        matchResultId: matchRow.id,
        reviewStaticScore,
        staticSummary,
        aiReview: ruleReview(),
        debug: buildDebug(
          "match_review_fallback_rule_based",
          `${MATCH_REVIEW_RULE_SOURCE_VERSION}|fallback|${reason}`,
          true,
          {
            reason,
            provider: this.aiConfig.providerSlug,
            model: this.aiConfig.model,
          },
        ),
      };
    }

    const mapped = mapModelJsonToAiMatchReview(result.content);
    if (!mapped) {
      this.logger.warn(
        JSON.stringify({
          event: MATCH_REVIEW_AI_LOG_EVENT,
          matchResultId: matchRow.id,
          outcome: "fallback",
          reason: "validation_failed",
          durationMs,
          providerSlug: this.aiConfig.providerSlug,
        }),
      );
      return {
        viewerUserId: tokenUserId,
        candidateUserId: cid,
        matchResultId: matchRow.id,
        reviewStaticScore,
        staticSummary,
        aiReview: ruleReview(),
        debug: buildDebug(
          "match_review_fallback_rule_based",
          `${MATCH_REVIEW_RULE_SOURCE_VERSION}|fallback|validation_failed`,
          true,
          {
            reason: "validation_failed",
            provider: this.aiConfig.providerSlug,
            model: this.aiConfig.model,
          },
        ),
      };
    }

    const slug = this.aiConfig.providerSlug;
    const sourceType = `match_review_model_${slug}`;
    const sourceVersion = `${slug}|${this.aiConfig.model}|${MATCH_REVIEW_PROMPT_VERSION}`;

    this.logger.log(
      JSON.stringify({
        event: MATCH_REVIEW_AI_LOG_EVENT,
        matchResultId: matchRow.id,
        outcome: "model_ok",
        durationMs,
        providerSlug: slug,
      }),
    );

    return {
      viewerUserId: tokenUserId,
      candidateUserId: cid,
      matchResultId: matchRow.id,
      reviewStaticScore,
      staticSummary,
      aiReview: mapped,
      debug: buildDebug(sourceType, sourceVersion, false, {
        provider: slug,
        model: this.aiConfig.model,
      }),
    };
  }
}
