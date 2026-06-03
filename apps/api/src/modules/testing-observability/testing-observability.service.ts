import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { G1R_PROFILE_KEYS } from "../questionnaire/questionnaire.scorer";
import { getCanonicalQuestionKeys } from "../questionnaire/data/questions";
import { PrismaService } from "../../common/prisma/prisma.service";
import { buildTestingMatchDebugSummary } from "./testing-observability-match-debug";
import { enrichTestingMatchSummaries } from "./testing-observability-match-enrichment";
import {
  TESTING_MATCH_FEEDBACK_RATINGS,
  TESTING_OBSERVABILITY_SOURCE_VERSION,
} from "./testing-observability-env";
import type {
  TestingEventRow,
  TestingFeedbackRow,
  TestingMatchDebugSummary,
  TestingOnboardingSummary,
  TestingQuestionnaireSummary,
  TestingTimelineItem,
  TestingTimelineStatus,
  TestingUserListItem,
} from "./testing-observability.types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

function countTier3121(items: Array<{ tier: string }>) {
  let aestheticMatchCount = 0;
  let similarStyleCount = 0;
  let explorationCount = 0;
  for (const it of items) {
    const t = (it.tier || "").trim();
    if (t === "aesthetic_fit") aestheticMatchCount += 1;
    else if (t === "style_similar") similarStyleCount += 1;
    else if (t === "reflow") explorationCount += 1;
  }
  const totalCount = items.length;
  const isThreeTwoOneValid =
    aestheticMatchCount === 3 &&
    similarStyleCount === 2 &&
    explorationCount === 1 &&
    totalCount === 6;
  return {
    aestheticMatchCount,
    similarStyleCount,
    explorationCount,
    totalCount,
    expectedAestheticMatchCount: 3 as const,
    expectedSimilarStyleCount: 2 as const,
    expectedExplorationCount: 1 as const,
    isThreeTwoOneValid,
  };
}

@Injectable()
export class TestingObservabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(limitRaw?: string): Promise<{
    sourceVersion: string;
    generatedAt: string;
    items: TestingUserListItem[];
  }> {
    const limit = clampLimit(limitRaw);
    const users = await this.prisma.user.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        nickname: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        onboardingPhotoAestheticCompletedAt: true,
        onboardingPhotoPreviewCompletedAt: true,
        images: { select: { id: true }, take: 1 },
        relationProfile: { select: { id: true } },
        onboardingPhotoPreviewPools: {
          where: { status: "active" },
          take: 1,
          select: { id: true },
        },
        matchResultsAsViewer: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const items: TestingUserListItem[] = [];
    for (const u of users) {
      const latestMr = u.matchResultsAsViewer[0];
      let latestDisplaySourceType: string | null = null;
      let latestFallbackUsed: boolean | null = null;
      if (latestMr) {
        try {
          const dbg = await buildTestingMatchDebugSummary(this.prisma, latestMr);
          latestDisplaySourceType = dbg.displaySourceType;
          latestFallbackUsed = dbg.fallbackUsed;
        } catch {
          latestDisplaySourceType = null;
        }
      }

      const hasPhotoUpload = u.images.length > 0;
      const hasPhotoPreference = u.onboardingPhotoAestheticCompletedAt != null;
      const hasPreviewPool = u.onboardingPhotoPreviewPools.length > 0;
      const hasQuestionnaireProfile = u.relationProfile != null;
      const hasMatchResult = latestMr != null;

      let onboardingStatus = "registered";
      if (hasMatchResult) onboardingStatus = "matched";
      else if (hasQuestionnaireProfile || u.onboardingPhotoPreviewCompletedAt)
        onboardingStatus = "questionnaire";
      else if (hasPreviewPool) onboardingStatus = "preview_pool";
      else if (hasPhotoPreference) onboardingStatus = "photo_preference";
      else if (hasPhotoUpload) onboardingStatus = "photo_upload";

      items.push({
        userId: u.id,
        displayName: u.nickname?.trim() || null,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        onboardingStatus,
        hasPhotoUpload,
        hasPhotoPreference,
        hasPreviewPool,
        hasQuestionnaireProfile,
        hasMatchResult,
        latestMatchResultId: latestMr?.id ?? null,
        latestDisplaySourceType,
        latestFallbackUsed,
        latestErrorCode: null,
      });
    }

    return {
      sourceVersion: TESTING_OBSERVABILITY_SOURCE_VERSION,
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        onboardingPhotoAestheticCompletedAt: true,
        onboardingPhotoPreviewCompletedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const [onboarding, questionnaire, match, recentEvents, recentFeedback] =
      await Promise.all([
        this.getOnboarding(userId),
        this.getQuestionnaire(userId),
        this.getUserMatch(userId),
        this.listEvents({ userId, limit: "20" }),
        this.listFeedback({ userId, limit: "20" }),
      ]);

    const timeline = await this.buildTimeline(userId, user, onboarding, questionnaire, match);

    return {
      sourceVersion: TESTING_OBSERVABILITY_SOURCE_VERSION,
      generatedAt: new Date().toISOString(),
      sections: {
        user: {
          userId: user.id,
          displayName: user.nickname?.trim() || null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
        timeline,
        onboarding,
        questionnaire,
        match,
        recentEvents: recentEvents.items,
        recentFeedback: recentFeedback.items,
      },
    };
  }

  private async buildTimeline(
    userId: string,
    user: {
      createdAt: Date;
      onboardingPhotoAestheticCompletedAt: Date | null;
      onboardingPhotoPreviewCompletedAt: Date | null;
    },
    onboarding: TestingOnboardingSummary,
    questionnaire: TestingQuestionnaireSummary,
    match: { latest: TestingMatchDebugSummary | null },
  ): Promise<TestingTimelineItem[]> {
    const firstImage = await this.prisma.userImage.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, updatedAt: true },
    });
    const firstAnswer = await this.prisma.questionnaireAnswer.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const pool = await this.prisma.onboardingPhotoPreviewPool.findFirst({
      where: { userId, status: "active" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, updatedAt: true, sourceVersion: true },
    });

    const item = (
      key: string,
      label: string,
      status: TestingTimelineStatus,
      createdAt: Date | null | undefined,
      updatedAt?: Date | null,
      extra?: Partial<TestingTimelineItem>,
    ): TestingTimelineItem => ({
      key,
      label,
      status,
      createdAt: iso(createdAt ?? null),
      updatedAt: iso(updatedAt ?? createdAt ?? null),
      sourceVersion: extra?.sourceVersion ?? null,
      fallbackUsed: extra?.fallbackUsed ?? null,
      errorCode: extra?.errorCode ?? null,
    });

    return [
      item("user_created", "用户注册", "success", user.createdAt),
      item(
        "photo_uploaded",
        "照片上传",
        firstImage ? "success" : "pending",
        firstImage?.createdAt,
        firstImage?.updatedAt,
      ),
      item(
        "photo_preference_submitted",
        "审美偏好提交",
        user.onboardingPhotoAestheticCompletedAt ? "success" : "pending",
        user.onboardingPhotoAestheticCompletedAt,
      ),
      item(
        "preview_pool_generated",
        "预览池生成 (3-2-1)",
        pool
          ? onboarding.poolCounts?.isThreeTwoOneValid
            ? "success"
            : "failed"
          : "pending",
        pool?.createdAt,
        pool?.updatedAt,
        { sourceVersion: pool?.sourceVersion ?? null },
      ),
      item(
        "questionnaire_started",
        "问卷开始",
        firstAnswer ? "success" : "pending",
        firstAnswer?.createdAt,
      ),
      item(
        "questionnaire_completed",
        "问卷画像",
        questionnaire.convergenceStatus === "converged"
          ? "success"
          : questionnaire.answeredCount > 0
            ? "pending"
            : "unavailable",
        questionnaire.updatedAt ? new Date(questionnaire.updatedAt) : null,
      ),
      item(
        "match_result_created",
        "匹配结果",
        match.latest ? "success" : "pending",
        match.latest ? new Date(match.latest.createdAt) : null,
        match.latest ? new Date(match.latest.updatedAt) : null,
        {
          sourceVersion: match.latest?.sourceVersion ?? null,
          fallbackUsed: match.latest?.fallbackUsed ?? null,
        },
      ),
      item(
        "final_match_available",
        "Final Match 可读",
        match.latest ? "success" : "unavailable",
        match.latest ? new Date(match.latest.createdAt) : null,
        undefined,
        {
          sourceVersion: match.latest?.displaySourceType ?? null,
        },
      ),
    ];
  }

  async getOnboarding(userId: string): Promise<TestingOnboardingSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        onboardingPhotoAestheticCompletedAt: true,
        images: { select: { id: true, detectionStatus: true, reviewStatus: true } },
      },
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const passingImage = user.images.some(
      (img) =>
        img.detectionStatus === "passed" ||
        img.reviewStatus === "approved" ||
        img.reviewStatus === "not_required",
    );

    const activePool = await this.prisma.onboardingPhotoPreviewPool.findFirst({
      where: { userId, status: "active" },
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { rankInPool: "asc" } } },
    });

    const replacedCount = await this.prisma.onboardingPhotoPreviewPool.count({
      where: { userId, status: "replaced" },
    });

    let poolCounts = null;
    let safeCandidateUserIds: string[] = [];
    let duplicateCandidateIds: string[] = [];
    let selfMatchDetected = false;

    if (activePool) {
      safeCandidateUserIds = activePool.items.map((i) => i.candidateUserId);
      poolCounts = countTier3121(activePool.items);
      const seen = new Set<string>();
      for (const cid of safeCandidateUserIds) {
        if (cid === userId) selfMatchDetected = true;
        if (seen.has(cid)) duplicateCandidateIds.push(cid);
        seen.add(cid);
      }
      duplicateCandidateIds = [...new Set(duplicateCandidateIds)];
    }

    return {
      uploadStatus: passingImage ? "passed_or_reviewed" : user.images.length ? "uploaded_pending" : "none",
      preferenceStatus: user.onboardingPhotoAestheticCompletedAt
        ? "completed"
        : "pending",
      previewPoolStatus: activePool
        ? "active"
        : replacedCount > 0
          ? "replaced"
          : "none",
      expectedPoolRule: "3-2-1",
      poolCounts,
      duplicateCandidateIds,
      selfMatchDetected,
      frozenOrRegenerateState:
        replacedCount > 0 ? `replaced_pools:${replacedCount}` : null,
      sourceVersion: activePool?.sourceVersion ?? null,
      fallbackUsed: null,
      safeCandidateUserIds,
    };
  }

  async getQuestionnaire(userId: string): Promise<TestingQuestionnaireSummary> {
    const [answers, profile] = await Promise.all([
      this.prisma.questionnaireAnswer.findMany({
        where: { userId },
        select: { questionKey: true },
      }),
      this.prisma.userProfile.findUnique({ where: { userId } }),
    ]);

    const requiredCount = getCanonicalQuestionKeys().length;
    const answeredKeys = new Set(answers.map((a) => a.questionKey));
    const answeredCount = answeredKeys.size;

    const missingDimensions: string[] = [];
    let filledAxisCount = 0;
    if (profile) {
      for (const key of G1R_PROFILE_KEYS) {
        const v = profile[key as keyof typeof profile];
        if (typeof v === "number" && Number.isFinite(v)) {
          filledAxisCount += 1;
        } else {
          missingDimensions.push(key);
        }
      }
    }

    const totalAxisCount = G1R_PROFILE_KEYS.length;
    let convergenceStatus: TestingQuestionnaireSummary["convergenceStatus"] =
      "unknown";
    if (!profile && answeredCount === 0) {
      convergenceStatus = "insufficient_data";
    } else if (filledAxisCount >= totalAxisCount * 0.8 && answeredCount >= requiredCount * 0.8) {
      convergenceStatus = "converged";
    } else if (answeredCount > 0 || profile) {
      convergenceStatus = "not_converged";
    } else {
      convergenceStatus = "insufficient_data";
    }

    return {
      answeredCount,
      requiredCount,
      convergenceStatus,
      profileDimensionCompleteness: profile
        ? Math.round((filledAxisCount / totalAxisCount) * 100) / 100
        : 0,
      missingDimensions: missingDimensions.slice(0, 12),
      sourceVersion: "questionnaire-g1r-v1",
      updatedAt: profile?.updatedAt ? profile.updatedAt.toISOString() : null,
      safeProfileSummary: profile
        ? {
            confidence:
              typeof profile.confidence === "number" ? profile.confidence : null,
            filledAxisCount,
            totalAxisCount,
          }
        : null,
    };
  }

  async getUserMatch(userId: string): Promise<{
    latest: TestingMatchDebugSummary | null;
    history: TestingMatchDebugSummary[];
  }> {
    const rows = await this.prisma.matchResult.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    if (rows.length === 0) {
      return { latest: null, history: [] };
    }
    const history: TestingMatchDebugSummary[] = [];
    for (const row of rows) {
      history.push(await buildTestingMatchDebugSummary(this.prisma, row));
    }
    const enriched = await enrichTestingMatchSummaries(this.prisma, history);
    return { latest: enriched[0] ?? null, history: enriched };
  }

  async listMatches(limitRaw?: string) {
    const limit = clampLimit(limitRaw);
    const rows = await this.prisma.matchResult.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const items: TestingMatchDebugSummary[] = [];
    for (const row of rows) {
      items.push(await buildTestingMatchDebugSummary(this.prisma, row));
    }
    const enriched = await enrichTestingMatchSummaries(this.prisma, items);
    return {
      sourceVersion: TESTING_OBSERVABILITY_SOURCE_VERSION,
      generatedAt: new Date().toISOString(),
      items: enriched,
    };
  }

  async getMatchById(matchResultId: string): Promise<TestingMatchDebugSummary> {
    const row = await this.prisma.matchResult.findUnique({
      where: { id: matchResultId },
    });
    if (!row) {
      throw new NotFoundException(`MatchResult ${matchResultId} not found`);
    }
    const summary = await buildTestingMatchDebugSummary(this.prisma, row);
    const [enriched] = await enrichTestingMatchSummaries(this.prisma, [summary]);
    return enriched ?? summary;
  }

  async listEvents(query: { userId?: string; limit?: string }) {
    const limit = clampLimit(query.limit);
    const rows = await this.prisma.testingObservabilityEvent.findMany({
      where: query.userId ? { userId: query.userId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const items: TestingEventRow[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      matchResultId: r.matchResultId,
      eventType: r.eventType,
      status: r.status,
      source: r.source,
      sourceVersion: r.sourceVersion,
      fallbackUsed: r.fallbackUsed,
      errorCode: r.errorCode,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
    }));
    return {
      sourceVersion: TESTING_OBSERVABILITY_SOURCE_VERSION,
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  async listFeedback(query: { userId?: string; limit?: string }) {
    const limit = clampLimit(query.limit);
    const rows = await this.prisma.testingMatchFeedback.findMany({
      where: query.userId ? { userId: query.userId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const items: TestingFeedbackRow[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      matchResultId: r.matchResultId,
      rating: r.rating,
      reasonCodes: Array.isArray(r.reasonCodes)
        ? (r.reasonCodes as string[])
        : [],
      freeText: r.freeText,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
    }));
    return {
      sourceVersion: TESTING_OBSERVABILITY_SOURCE_VERSION,
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  async createMatchFeedback(body: {
    userId: string;
    matchResultId?: string;
    rating: string;
    reasonCodes?: string[];
    freeText?: string;
    source?: string;
  }) {
    const userId = body.userId?.trim();
    if (!userId) {
      throw new BadRequestException("userId is required");
    }
    const rating = body.rating?.trim();
    if (!rating || !TESTING_MATCH_FEEDBACK_RATINGS.includes(rating as never)) {
      throw new BadRequestException(
        `rating must be one of: ${TESTING_MATCH_FEEDBACK_RATINGS.join(", ")}`,
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (body.matchResultId) {
      const mr = await this.prisma.matchResult.findUnique({
        where: { id: body.matchResultId },
        select: { id: true },
      });
      if (!mr) {
        throw new NotFoundException(`MatchResult ${body.matchResultId} not found`);
      }
    }

    const row = await this.prisma.testingMatchFeedback.create({
      data: {
        userId,
        matchResultId: body.matchResultId?.trim() || null,
        rating,
        reasonCodes: body.reasonCodes?.length ? body.reasonCodes : undefined,
        freeText: body.freeText?.trim().slice(0, 500) || null,
        source: body.source?.trim() || "testing_monitor_ui",
      },
    });

    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      sourceVersion: TESTING_OBSERVABILITY_SOURCE_VERSION,
    };
  }
}
