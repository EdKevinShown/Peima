import { Injectable } from "@nestjs/common";
import type { PreviewPoolItem, User, UserProfile } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RELATIONSHIP_SHORTLIST_TOP2_SOURCE_VERSION } from "./ai-pairwise-decision.schema";
import type { RelationshipShortlistTop2 } from "./ai-pairwise-decision.types";
import { parseAndValidateRelationshipShortlistTop2 } from "./ai-pairwise-decision.validate";
import {
  buildEligibleRowsForTop2,
  buildReasonSummaryTop2,
  compareEligibleForTop2,
  computeRelationshipShortlistFingerprint,
  deriveStrengthAndRiskTags,
  toPreferenceGatePref,
} from "./ai-pairwise-top2-shortlist.builder";

export type RelationshipShortlistTop2ErrorCode =
  | "POOL_NOT_FOUND"
  | "VIEWER_PROFILE_REQUIRED"
  | "INSUFFICIENT_ELIGIBLE_CANDIDATES";

export class RelationshipShortlistTop2Error extends Error {
  constructor(
    public readonly code: RelationshipShortlistTop2ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RelationshipShortlistTop2Error";
  }
}

/**
 * M3.8-M1: read-only **RelationshipShortlistTop2** from a preview pool + G1-R profiles (no LLM, no MatchResult writes).
 */
@Injectable()
export class AiPairwiseTop2ShortlistService {
  constructor(private readonly prisma: PrismaService) {}

  async buildRelationshipShortlistTop2(params: {
    viewerUserId: string;
    poolId: string;
  }): Promise<RelationshipShortlistTop2> {
    const { viewerUserId, poolId } = params;

    const pool = await this.prisma.previewPool.findFirst({
      where: { id: poolId, userId: viewerUserId },
      include: { items: { orderBy: { rankInPool: "asc" } } },
    });
    if (!pool?.items?.length) {
      throw new RelationshipShortlistTop2Error(
        "POOL_NOT_FOUND",
        `Preview pool not found or empty for viewerUserId=${viewerUserId} poolId=${poolId}`,
      );
    }

    const [viewerProf, prefRow] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId: viewerUserId } }),
      this.prisma.userPreference.findUnique({ where: { userId: viewerUserId } }),
    ]);
    if (!viewerProf) {
      throw new RelationshipShortlistTop2Error(
        "VIEWER_PROFILE_REQUIRED",
        "Viewer must have a user_profile row to compute G1-R static Top2.",
      );
    }

    const candidateIds = [...new Set(pool.items.map((it) => it.candidateUserId))];
    const [users, profiles] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: candidateIds } } }),
      this.prisma.userProfile.findMany({ where: { userId: { in: candidateIds } } }),
    ]);
    const candidateUserById = new Map<string, User>(users.map((u) => [u.id, u]));
    const candidateProfileById = new Map<string, UserProfile>(profiles.map((p) => [p.userId, p]));

    const eligible = buildEligibleRowsForTop2({
      viewerUserId,
      viewerProfile: viewerProf,
      gatePref: toPreferenceGatePref(prefRow),
      items: pool.items,
      candidateUserById,
      candidateProfileById,
    }).sort(compareEligibleForTop2);

    if (eligible.length < 2) {
      throw new RelationshipShortlistTop2Error(
        "INSUFFICIENT_ELIGIBLE_CANDIDATES",
        `Need at least 2 eligible preview-pool candidates (full display, profile present, preference hard gate); got ${eligible.length}.`,
      );
    }

    const top = eligible.slice(0, 2);
    const generatedAt = new Date().toISOString();
    const reasonSummary = buildReasonSummaryTop2();

    const candidates: RelationshipShortlistTop2["candidates"] = [
      this.toContractCandidate(top[0]!, 1, reasonSummary),
      this.toContractCandidate(top[1]!, 2, reasonSummary),
    ];

    const shortlistFingerprint = computeRelationshipShortlistFingerprint({
      viewerUserId,
      poolId,
      orderedCandidateIds: [candidates[0].candidateUserId, candidates[1].candidateUserId],
      staticCompatibilityScores: [candidates[0].staticCompatibilityScore, candidates[1].staticCompatibilityScore],
    });

    const raw: RelationshipShortlistTop2 = {
      schemaVersion: 1,
      sourceVersion: RELATIONSHIP_SHORTLIST_TOP2_SOURCE_VERSION,
      viewerUserId,
      poolId,
      shortlistFingerprint,
      candidates,
      generatedAt,
    };

    const validated = parseAndValidateRelationshipShortlistTop2(raw);
    if (!validated.ok) {
      throw new Error(
        `Internal RelationshipShortlistTop2 contract violation: ${validated.failureDetail.path} ${validated.failureDetail.reason}`,
      );
    }
    return validated.value;
  }

  private toContractCandidate(
    row: {
      item: PreviewPoolItem;
      candidateUserId: string;
      staticCompatibilityScore: number;
      axisScoresSummary: Record<string, number>;
    },
    staticRank: 1 | 2,
    reasonSummary: string,
  ): RelationshipShortlistTop2["candidates"][number] {
    const { majorStrengths, majorRisks } = deriveStrengthAndRiskTags(row.axisScoresSummary);
    return {
      candidateUserId: row.candidateUserId,
      staticRank,
      staticCompatibilityScore: row.staticCompatibilityScore,
      axisScoresSummary: row.axisScoresSummary,
      majorStrengths,
      majorRisks,
      dealbreakerPassed: true,
      visualPoolRank: row.item.rankInPool,
      reasonSummary,
    };
  }
}
