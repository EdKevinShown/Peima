import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { BatchMatchQueue, MatchResult } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EnqueueMatchDto } from "./dto/enqueue-match.dto";
import { readM5FinalDecisionShadowEnabled } from "./matching-m5-final-decision-shadow-env";
import {
  buildMultiSourceFinalDecisionReadonlyM51M0,
  type MultiSourceFinalDecisionReadonlyM51M0,
} from "./matching-multi-source-final-decision-m51m0";
import {
  buildResolvedMatchProjection,
  resolveMatchResultDisplay,
  type MatchResultDisplayFields,
  type ResolvedMatchProjectionFields,
} from "./matching-result-display";
import {
  resolveRelationshipProfileScoreShadow,
  type ViewerSafeRelationshipProfileScoreShadow,
} from "./matching-relationship-profile-score";
import {
  resolveRelationshipProfileScoreV2Shadow,
  type ViewerSafeRelationshipProfileScoreV2,
} from "./matching-relationship-profile-score-v2";
import {
  parseScoreBreakdownFromReasonSummary,
  type ViewerSafeScoreBreakdown,
} from "./matching-score-breakdown";

export type MatchStatusPayload = {
  status: "not_queued" | "waiting" | "processing" | "ready";
};

export type { MatchResultConsistencyWarning, ResolvedMatchProjectionFields } from "./matching-result-display";

/** M3.8-M13 + M5.1 / M5.2-M0: `GET /matching/result` — row + display + multi-source sidecar (optional shadow contract via env, no display mutation). */
export type MatchResultViewerPayload = MatchResult &
  MatchResultDisplayFields &
  ResolvedMatchProjectionFields & {
    multiSourceFinalDecision: MultiSourceFinalDecisionReadonlyM51M0;
    /** M6.0-B: parsed from `reasonSummary` only; viewer-safe numbers + source enum. */
    scoreBreakdown: ViewerSafeScoreBreakdown;
    /** M6.0-C: shadow; first version = `scoreBreakdown.profileScore` when available. */
    relationshipProfileScore: ViewerSafeRelationshipProfileScoreShadow;
    /** M6.0-J4: V2 shadow from `matchInsights.scoreShadowV2` when valid. */
    relationshipProfileScoreV2: ViewerSafeRelationshipProfileScoreV2;
  };

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  async enqueue(dto: EnqueueMatchDto): Promise<BatchMatchQueue> {
    await this.ensureUserExists(dto.userId);

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: dto.userId },
    });
    if (!profile) {
      throw new BadRequestException(
        "User must complete the questionnaire before joining the match queue",
      );
    }

    const existing = await this.prisma.batchMatchQueue.findFirst({
      where: { userId: dto.userId, status: "waiting" },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.batchMatchQueue.create({
      data: {
        userId: dto.userId,
        status: "waiting",
      },
    });
  }

  async getStatusForUser(userId: string): Promise<MatchStatusPayload> {
    await this.ensureUserExists(userId);

    const latestResult = await this.prisma.matchResult.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    const latestQueue = await this.prisma.batchMatchQueue.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (!latestQueue) {
      return { status: latestResult ? "ready" : "not_queued" };
    }

    if (latestQueue.status === "waiting") {
      return { status: "waiting" };
    }
    if (latestQueue.status === "processing") {
      return { status: "processing" };
    }
    if (latestQueue.status === "matched") {
      return { status: "ready" };
    }

    if (latestResult) {
      return { status: "ready" };
    }
    return { status: "not_queued" };
  }

  async getLatestResultForUser(userId: string): Promise<MatchResultViewerPayload> {
    await this.ensureUserExists(userId);

    const result = await this.prisma.matchResult.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (!result) {
      throw new NotFoundException(`No match result for user ${userId}`);
    }
    let display: MatchResultDisplayFields;
    let displayResolverErrored = false;
    try {
      display = await resolveMatchResultDisplay(this.prisma, result);
    } catch {
      displayResolverErrored = true;
      display = {
        displayCandidateUserId: result.candidateUserId,
        displaySourceType: "match_result_original",
        finalMatchDecisionMeta: null,
      };
    }
    const resolvedProjection = buildResolvedMatchProjection(result.candidateUserId, display, {
      displayResolverErrored,
    });
    const multiSourceFinalDecision = buildMultiSourceFinalDecisionReadonlyM51M0(result, display, {
      shadowEnabled: readM5FinalDecisionShadowEnabled(),
    });
    const scoreBreakdown = parseScoreBreakdownFromReasonSummary(result.reasonSummary);
    const relationshipProfileScore = resolveRelationshipProfileScoreShadow(
      result.matchInsights,
      scoreBreakdown,
    );
    const relationshipProfileScoreV2 = resolveRelationshipProfileScoreV2Shadow(
      result.matchInsights,
    );
    return {
      ...result,
      ...display,
      ...resolvedProjection,
      multiSourceFinalDecision,
      scoreBreakdown,
      relationshipProfileScore,
      relationshipProfileScoreV2,
    };
  }
}
