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
  applyResolvedScoreProjection,
  buildResolvedMatchProjection,
  resolveMatchResultDisplay,
  type MatchResultDisplayFields,
  type ResolvedMatchProjectionFields,
  tryResolveRrmBoundedDecisionReadLayerOverride,
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
import { readP76ResultStateContractEnv } from "./p76-result-state-env";
import {
  attachResultStateToViewerPayload,
  deriveNoRowResultState,
  type MatchResultNoRowContractPayload,
  type MatchResultResultStateFields,
} from "./matching-result-state";
import { enrichNoRowResultForLegacyWriterShutdown } from "./p710-r10-safe-fallback-final-policy";
import {
  projectMatchResultForViewer,
  resolveLatestMatchResultAccess,
} from "./matching-latest-result-access";

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

/** P7.10-r4a: optional when `PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED=1`. */
export type { MatchResultResultStateFields, MatchResultNoRowContractPayload };

export type GetMatchResultResponse =
  | MatchResultViewerPayload
  | MatchResultNoRowContractPayload;

export function isMatchResultViewerPayload(
  payload: GetMatchResultResponse,
): payload is MatchResultViewerPayload {
  return "candidateUserId" in payload && typeof payload.candidateUserId === "string";
}

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
        "请先完成关系问卷并生成画像，再点击「开始匹配」。",
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

    const latestAccess = await resolveLatestMatchResultAccess(this.prisma, userId);

    const latestQueue = await this.prisma.batchMatchQueue.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (!latestQueue) {
      return { status: latestAccess ? "ready" : "not_queued" };
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

    if (latestAccess) {
      return { status: "ready" };
    }
    return { status: "not_queued" };
  }

  async getLatestResultForUser(userId: string): Promise<GetMatchResultResponse> {
    await this.ensureUserExists(userId);

    const resultStateContract = readP76ResultStateContractEnv();

    const access = await resolveLatestMatchResultAccess(this.prisma, userId);
    if (!access) {
      if (!resultStateContract.enabled) {
        throw new NotFoundException(`No match result for user ${userId}`);
      }
      const { status } = await this.getStatusForUser(userId);
      const latestQueue = await this.prisma.batchMatchQueue.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      });
      const base = deriveNoRowResultState(status);
      return enrichNoRowResultForLegacyWriterShutdown(base, {
        queueStatus: status,
        latestQueueRowStatus: latestQueue?.status ?? null,
      });
    }

    const payload = await this.buildMatchResultViewerPayload(
      projectMatchResultForViewer(access),
    );
    if (!resultStateContract.enabled) {
      return payload;
    }
    return attachResultStateToViewerPayload(payload);
  }

  private async buildMatchResultViewerPayload(
    result: MatchResult,
  ): Promise<MatchResultViewerPayload> {
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
    const resolvedBase = buildResolvedMatchProjection(result.candidateUserId, display, {
      displayResolverErrored,
    });
    const resolvedProjection = await tryResolveRrmBoundedDecisionReadLayerOverride(
      result.matchInsights,
      resolvedBase,
      {
        hasUser: async (id: string) =>
          !!(await this.prisma.user.findUnique({ where: { id }, select: { id: true } })),
        hasUserProfile: async (id: string) =>
          !!(await this.prisma.userProfile.findUnique({
            where: { userId: id },
            select: { userId: true },
          })),
      },
    );
    const resolvedScoreProjection = applyResolvedScoreProjection({
      current: resolvedProjection,
      matchInsights: result.matchInsights,
      baselineFinalScore: result.finalScore,
    });
    const multiSourceFinalDecision = buildMultiSourceFinalDecisionReadonlyM51M0(
      result,
      display,
      {
        shadowEnabled: readM5FinalDecisionShadowEnabled(),
      },
    );
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
      ...resolvedScoreProjection,
      multiSourceFinalDecision,
      scoreBreakdown,
      relationshipProfileScore,
      relationshipProfileScoreV2,
    };
  }
}
