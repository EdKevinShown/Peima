import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { QuestionnaireService } from "../questionnaire/questionnaire.service";
import { buildMatchReviewStaticSummary } from "../match-review-ai/match-review-static-summary";
import { InteractionSimulationLiteChatCompletionsClient } from "./interaction-simulation-lite-chat-completions.client";
import { InteractionSimulationLiteConfigService } from "./interaction-simulation-lite.config.service";
import {
  INTERACTION_SIMULATION_LITE_LOG_EVENT,
  INTERACTION_SIMULATION_LITE_PROMPT_VERSION,
  INTERACTION_SIMULATION_LITE_RULE_SOURCE_VERSION,
} from "./interaction-simulation-lite.constants";
import {
  buildInteractionSimulationLiteUserContent,
  INTERACTION_SIMULATION_LITE_SYSTEM_PROMPT,
} from "./interaction-simulation-lite-model.prompt";
import { parseInteractionSimulationLiteModelJson } from "./interaction-simulation-lite-model.mapper";
import { buildInteractionSimulationLiteRulePayload } from "./interaction-simulation-lite-rule";
import type { InteractionSimulationLiteResponseDto } from "./interaction-simulation-lite.types";
import type { InteractionSimulationLiteChatFailureKind } from "./interaction-simulation-lite-chat-completions.client";

function mapFailureKindToReason(
  kind: InteractionSimulationLiteChatFailureKind,
): NonNullable<InteractionSimulationLiteResponseDto["debug"]["meta"]>["reason"] {
  if (kind === "disabled") return "disabled";
  if (kind === "missing_api_key") return "missing_config";
  if (kind === "timeout") return "timeout";
  if (kind === "http") return "http_error";
  if (kind === "invalid_json_response" || kind === "empty_content") {
    return "invalid_json";
  }
  if (kind === "network") return "network";
  return "unknown";
}

@Injectable()
export class InteractionSimulationLiteService {
  private readonly logger = new Logger(InteractionSimulationLiteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionnaireService: QuestionnaireService,
    private readonly aiConfig: InteractionSimulationLiteConfigService,
    private readonly chatClient: InteractionSimulationLiteChatCompletionsClient,
  ) {}

  async getSimulation(
    matchResultId: string,
    tokenUserId: string,
  ): Promise<InteractionSimulationLiteResponseDto> {
    const mid = matchResultId.trim();
    const t0 = Date.now();

    const row = await this.prisma.matchResult.findUnique({
      where: { id: mid },
    });
    if (!row) {
      throw new NotFoundException(`Match result ${mid} not found`);
    }
    if (row.userId !== tokenUserId) {
      throw new ForbiddenException("match result not accessible by this user");
    }

    let viewerProfileView;
    let candidateProfileView;
    try {
      viewerProfileView =
        await this.questionnaireService.getProfileForUser(tokenUserId);
      candidateProfileView =
        await this.questionnaireService.getProfileForUser(row.candidateUserId);
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new NotFoundException(
          "questionnaire profile missing for viewer or candidate",
        );
      }
      throw e;
    }

    const { reviewStaticScore, staticSummary } = buildMatchReviewStaticSummary(
      viewerProfileView,
      candidateProfileView,
    );

    const rulePayload = buildInteractionSimulationLiteRulePayload({
      reviewStaticScore,
      staticSummary,
    });

    const buildRuleResponse = (
      fallbackUsed: boolean,
      sourceType: string,
      sourceVersion: string,
      meta?: InteractionSimulationLiteResponseDto["debug"]["meta"],
    ): InteractionSimulationLiteResponseDto => ({
      matchResultId: row.id,
      viewerUserId: tokenUserId,
      candidateUserId: row.candidateUserId,
      reviewStaticScore,
      axes: rulePayload.axes,
      overall: rulePayload.overall,
      debug: {
        sourceType,
        sourceVersion,
        fallbackUsed,
        meta,
      },
    });

    if (!this.aiConfig.interactionSimulationLiteEnabled) {
      this.logger.warn(
        JSON.stringify({
          event: INTERACTION_SIMULATION_LITE_LOG_EVENT,
          matchResultId: mid,
          outcome: "rule_only",
          reason: "disabled",
          durationMs: Date.now() - t0,
        }),
      );
      return buildRuleResponse(
        false,
        "interaction_simulation_lite_rule",
        INTERACTION_SIMULATION_LITE_RULE_SOURCE_VERSION,
        {
          reason: "disabled",
          provider: this.aiConfig.providerSlug,
          model: this.aiConfig.model,
        },
      );
    }

    if (!this.aiConfig.apiKey) {
      this.logger.warn(
        JSON.stringify({
          event: INTERACTION_SIMULATION_LITE_LOG_EVENT,
          matchResultId: mid,
          outcome: "rule_only",
          reason: "missing_config",
          durationMs: Date.now() - t0,
        }),
      );
      return buildRuleResponse(
        false,
        "interaction_simulation_lite_rule",
        INTERACTION_SIMULATION_LITE_RULE_SOURCE_VERSION,
        {
          reason: "missing_config",
          provider: this.aiConfig.providerSlug,
          model: this.aiConfig.model,
        },
      );
    }

    const userContent = buildInteractionSimulationLiteUserContent({
      reviewStaticScore,
      labelFitSummary: staticSummary.labelFitSummary,
      confidenceSummary: staticSummary.confidenceSummary,
      majorFits: staticSummary.majorFits,
      majorRisks: staticSummary.majorRisks,
    });

    const result = await this.chatClient.complete(
      INTERACTION_SIMULATION_LITE_SYSTEM_PROMPT,
      userContent,
    );
    const durationMs = Date.now() - t0;

    if (!result.ok) {
      const reason = mapFailureKindToReason(result.kind);
      this.logger.warn(
        JSON.stringify({
          event: INTERACTION_SIMULATION_LITE_LOG_EVENT,
          matchResultId: mid,
          outcome: "fallback",
          reason: result.kind,
          mappedReason: reason,
          durationMs,
          providerSlug: this.aiConfig.providerSlug,
        }),
      );
      return buildRuleResponse(
        true,
        `interaction_simulation_lite_rule|fallback|${reason}`,
        `${INTERACTION_SIMULATION_LITE_RULE_SOURCE_VERSION}|fallback|${reason}`,
        {
          reason,
          provider: this.aiConfig.providerSlug,
          model: this.aiConfig.model,
        },
      );
    }

    const mapped = parseInteractionSimulationLiteModelJson(result.content);
    if (!mapped) {
      this.logger.warn(
        JSON.stringify({
          event: INTERACTION_SIMULATION_LITE_LOG_EVENT,
          matchResultId: mid,
          outcome: "fallback",
          reason: "invalid_json",
          durationMs,
        }),
      );
      return buildRuleResponse(
        true,
        "interaction_simulation_lite_rule|fallback|invalid_json",
        `${INTERACTION_SIMULATION_LITE_RULE_SOURCE_VERSION}|fallback|invalid_json`,
        {
          reason: "invalid_json",
          provider: this.aiConfig.providerSlug,
          model: this.aiConfig.model,
        },
      );
    }

    const slug = this.aiConfig.providerSlug;
    const sourceType = `interaction_simulation_lite_model_${slug}`;
    const sourceVersion = `${slug}|${this.aiConfig.model}|${INTERACTION_SIMULATION_LITE_PROMPT_VERSION}`;

    this.logger.log(
      JSON.stringify({
        event: INTERACTION_SIMULATION_LITE_LOG_EVENT,
        matchResultId: mid,
        outcome: "model_ok",
        durationMs,
        providerSlug: slug,
      }),
    );

    return {
      matchResultId: row.id,
      viewerUserId: tokenUserId,
      candidateUserId: row.candidateUserId,
      reviewStaticScore,
      axes: mapped.axes,
      overall: mapped.overall,
      debug: {
        sourceType,
        sourceVersion,
        fallbackUsed: false,
        meta: { provider: slug, model: this.aiConfig.model },
      },
    };
  }
}
