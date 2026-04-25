import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { QuestionnaireService } from "../questionnaire/questionnaire.service";
import { buildRuleAiMatchReview } from "../match-review-ai/match-review-ai-rule";
import { buildMatchReviewStaticSummary } from "../match-review-ai/match-review-static-summary";
import { buildInteractionSimulationLiteRulePayload } from "../interaction-simulation-lite/interaction-simulation-lite-rule";
import { computeReadoutFusion } from "./match-readout-fusion-fusion.rule";
import type { MatchReadoutFusionResponseDto } from "./match-readout-fusion.types";

@Injectable()
export class MatchReadoutFusionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionnaireService: QuestionnaireService,
  ) {}

  async getReadoutFusion(
    matchResultId: string,
    tokenUserId: string,
  ): Promise<MatchReadoutFusionResponseDto> {
    const mid = matchResultId.trim();
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

    const ruleReview = buildRuleAiMatchReview(reviewStaticScore, staticSummary);
    const lite = buildInteractionSimulationLiteRulePayload({
      reviewStaticScore,
      staticSummary,
    });

    return computeReadoutFusion({
      matchResultId: row.id,
      workerFinalScore: row.finalScore,
      p6xRecommendation: ruleReview.recommendation,
      p6yVerdict: lite.overall.verdict,
    });
  }
}
