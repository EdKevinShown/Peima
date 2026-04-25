import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { buildMatchReviewStaticSummary } from "../match-review-ai/match-review-static-summary";
import { buildInteractionSimulationLiteRulePayload } from "../interaction-simulation-lite/interaction-simulation-lite-rule";
import { QuestionnaireService } from "../questionnaire/questionnaire.service";
import {
  PRESCREEN_MAX_CANDIDATES,
  PRESCREEN_MAX_REASON_CODES,
  PRESCREEN_RULE_VERSION,
} from "./prescreen-v0.constants";
import {
  bandCompositeB,
  bucketFromTiers,
  buildReasonCodes,
  comparePrescreenRows,
  computePrescreenScore,
  staticTierFromScore,
  verdictTierFromVerdict,
} from "./prescreen-v0.rule";
import {
  PRESCREEN_V0_SCHEMA,
  type PrescreenV0BatchInputDto,
  type PrescreenV0BatchOutputDto,
  type PrescreenV0CandidateResultDto,
  type PrescreenV0DroppedCandidateDto,
  type PrescreenV0Purpose,
} from "./prescreen-v0.types";

@Injectable()
export class PrescreenV0Service {
  constructor(private readonly questionnaireService: QuestionnaireService) {}

  async prescreenBatch(dto: PrescreenV0BatchInputDto): Promise<PrescreenV0BatchOutputDto> {
    const purpose: PrescreenV0Purpose = dto.purpose ?? "shadow";

    if (dto.schemaVersion !== PRESCREEN_V0_SCHEMA) {
      throw new BadRequestException(
        `schemaVersion must be "${PRESCREEN_V0_SCHEMA}" (got ${JSON.stringify(dto.schemaVersion)})`,
      );
    }
    if (!dto.viewerUserId || typeof dto.viewerUserId !== "string") {
      throw new BadRequestException("viewerUserId is required");
    }
    if (!Array.isArray(dto.candidateUserIds)) {
      throw new BadRequestException("candidateUserIds must be an array");
    }

    const candidateUserIds = [...new Set(dto.candidateUserIds.filter((id) => id && id.trim()))];
    if (candidateUserIds.length === 0) {
      throw new BadRequestException("candidateUserIds must contain at least one id after dedupe");
    }
    if (candidateUserIds.length > PRESCREEN_MAX_CANDIDATES) {
      throw new BadRequestException(
        `candidateUserIds length must be at most ${PRESCREEN_MAX_CANDIDATES} after dedupe (got ${candidateUserIds.length})`,
      );
    }

    let viewerView;
    try {
      viewerView = await this.questionnaireService.getProfileForUser(dto.viewerUserId);
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new BadRequestException(`viewer profile unavailable: ${e.message}`);
      }
      throw e;
    }

    const droppedCandidates: PrescreenV0DroppedCandidateDto[] = [];
    const results: PrescreenV0CandidateResultDto[] = [];

    for (const candidateUserId of candidateUserIds) {
      let candidateView;
      try {
        candidateView = await this.questionnaireService.getProfileForUser(candidateUserId);
      } catch (e) {
        if (e instanceof NotFoundException) {
          droppedCandidates.push({
            candidateUserId,
            dropReason: "profile_not_found",
          });
          continue;
        }
        throw e;
      }

      const { reviewStaticScore, staticSummary } = buildMatchReviewStaticSummary(
        viewerView,
        candidateView,
      );
      const rule = buildInteractionSimulationLiteRulePayload({
        reviewStaticScore,
        staticSummary,
      });

      const staticTier = staticTierFromScore(reviewStaticScore);
      const verdictTier = verdictTierFromVerdict(rule.overall.verdict);
      const bucket = bucketFromTiers(staticTier, verdictTier);

      const pickup = rule.axes.pickupEase.band;
      const cold = rule.axes.coldFieldRisk.band;
      const mis = rule.axes.misunderstandingRisk.band;
      const cont = rule.axes.continuationSignal.band;

      const prescreenScore = computePrescreenScore({
        reviewStaticScore,
        verdict: rule.overall.verdict,
        pickup,
        cold,
        mis,
        cont,
      });

      const reasonCodes = buildReasonCodes({
        staticTier,
        verdict: rule.overall.verdict,
        pickup,
        cold,
        mis,
        cont,
        maxCodes: PRESCREEN_MAX_REASON_CODES,
      });

      const bandB = bandCompositeB({ pickup, cold, mis, cont });

      results.push({
        candidateUserId,
        bucket,
        prescreenScore,
        reasonCodes,
        debug: {
          reviewStaticScore,
          staticTier,
          verdict: rule.overall.verdict,
          verdictTier,
          bandB,
        },
      });
    }

    results.sort((a, b) => comparePrescreenRows(a, b));

    return {
      schemaVersion: PRESCREEN_V0_SCHEMA,
      viewerUserId: dto.viewerUserId,
      purpose,
      results,
      debug: {
        ruleVersion: PRESCREEN_RULE_VERSION,
        droppedCandidates,
      },
    };
  }
}
