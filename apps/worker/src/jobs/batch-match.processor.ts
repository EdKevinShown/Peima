import {
  PrismaClient,
  type User,
  type UserPreference,
  type UserProfile,
  type UserImage,
} from "@peima/database";
import {
  computeFinalScoreV1,
  formatReasonSummaryV1,
  type CandidateUserLike,
  type UserImageLike,
  type UserProfileLike,
  type ViewerPreferenceLike,
} from "./matching-score.js";
import { buildWorkerMatchInsightsForBestMatch } from "./batch-match-match-insights.js";

const BATCH_STATUS = {
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

const QUEUE_STATUS = {
  WAITING: "waiting",
  PROCESSING: "processing",
  MATCHED: "matched",
  FAILED: "failed",
} as const;

const PREVIEW_POOL_ACTIVE = "active";

const RESULT_STATUS_READY = "ready";

/** Log-only; not persisted. */
const REASON = {
  NO_ACTIVE_POOL: "NO_ACTIVE_POOL",
  NO_SCORED_CANDIDATES: "NO_SCORED_CANDIDATES",
  CANDIDATE_CONTEXT_MISSING: "CANDIDATE_CONTEXT_MISSING",
  CANDIDATE_PROFILE_MISSING: "CANDIDATE_PROFILE_MISSING",
  VIEWER_PROFILE_MISSING: "VIEWER_PROFILE_MISSING",
  UNEXPECTED_ERROR: "UNEXPECTED_ERROR",
} as const;

function logBatchLine(parts: Record<string, string | number | undefined>) {
  const kv = Object.entries(parts)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${String(v).replace(/\s/g, "_")}`);
  console.log(`[batch-match] ${kv.join(" ")}`);
}

function toViewerPreference(row: UserPreference): ViewerPreferenceLike {
  return {
    minAge: row.minAge,
    maxAge: row.maxAge,
    preferredCities: row.preferredCities ?? [],
    minHeight: row.minHeight,
    maxHeight: row.maxHeight,
    educationPreferences: row.educationPreferences ?? [],
    occupationPreferences: row.occupationPreferences ?? [],
    relationshipGoalPreferences: row.relationshipGoalPreferences ?? [],
    styleTags: row.styleTags ?? [],
  };
}

function toCandidateUser(row: User): CandidateUserLike {
  return {
    age: row.age,
    city: row.city,
    height: row.height,
    education: row.education,
    occupation: row.occupation,
    relationshipGoal: row.relationshipGoal,
  };
}

function toProfileLike(row: UserProfile | null): UserProfileLike {
  if (!row) return null;
  return {
    attachmentStyle: row.attachmentStyle,
    emotionalExpression: row.emotionalExpression,
    communicationStyle: row.communicationStyle,
    conflictHandling: row.conflictHandling,
    loveLanguage: row.loveLanguage,
    securityNeed: row.securityNeed,
    controlNeed: row.controlNeed,
    independence: row.independence,
    loyaltyView: row.loyaltyView,
    jealousyTendency: row.jealousyTendency,
    moneyAttitude: row.moneyAttitude,
    careerPriority: row.careerPriority,
    lifePace: row.lifePace,
    socialNeed: row.socialNeed,
    emotionalStability: row.emotionalStability,
    sexualValues: row.sexualValues,
    familyView: row.familyView,
    marriageExpectation: row.marriageExpectation,
    childrenIntent: row.childrenIntent,
    riskPreference: row.riskPreference,
  };
}

function toImageLike(row: UserImage | null): UserImageLike {
  if (!row) return null;
  return { styleTags: row.styleTags ?? [] };
}

async function loadCandidateContextMaps(
  prisma: PrismaClient,
  candidateIds: string[],
): Promise<{
  userMap: Map<string, User>;
  profileMap: Map<string, UserProfile>;
  imageMap: Map<string, UserImage>;
}> {
  if (candidateIds.length === 0) {
    return {
      userMap: new Map(),
      profileMap: new Map(),
      imageMap: new Map(),
    };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: candidateIds } },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const profiles = await prisma.userProfile.findMany({
    where: { userId: { in: candidateIds } },
  });
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));

  const images = await prisma.userImage.findMany({
    where: { userId: { in: candidateIds } },
    orderBy: { createdAt: "desc" },
  });
  const imageMap = new Map<string, UserImage>();
  for (const img of images) {
    if (!imageMap.has(img.userId)) imageMap.set(img.userId, img);
  }

  return { userMap, profileMap, imageMap };
}

export async function runBatchMatch(): Promise<void> {
  const prisma = new PrismaClient();

  const batch = await prisma.matchBatch.create({
    data: {
      batchDate: new Date(),
      status: BATCH_STATUS.RUNNING,
      totalUsers: 0,
      successCount: 0,
      failedCount: 0,
    },
  });

  try {
    const waiting = await prisma.batchMatchQueue.findMany({
      where: { status: QUEUE_STATUS.WAITING },
      orderBy: { createdAt: "asc" },
    });

    await prisma.matchBatch.update({
      where: { id: batch.id },
      data: { totalUsers: waiting.length },
    });

    logBatchLine({
      event: "batch_start",
      batchId: batch.id,
      totalQueues: waiting.length,
    });

    let successCount = 0;
    let failedCount = 0;

    for (const q of waiting) {
      await prisma.batchMatchQueue.update({
        where: { id: q.id },
        data: { status: QUEUE_STATUS.PROCESSING, batchId: batch.id },
      });

      logBatchLine({
        event: "queue_start",
        batchId: batch.id,
        queueId: q.id,
        viewerUserId: q.userId,
      });

      const pool = await prisma.previewPool.findFirst({
        where: { userId: q.userId, status: PREVIEW_POOL_ACTIVE },
        orderBy: { createdAt: "desc" },
        include: { items: { orderBy: { rankInPool: "asc" } } },
      });

      if (!pool || pool.items.length === 0) {
        await prisma.batchMatchQueue.update({
          where: { id: q.id },
          data: { status: QUEUE_STATUS.FAILED },
        });
        failedCount++;
        logBatchLine({
          event: "queue_done",
          batchId: batch.id,
          queueId: q.id,
          viewerUserId: q.userId,
          outcome: "fail",
          reasonCode: REASON.NO_ACTIVE_POOL,
        });
        continue;
      }

      const viewerPrefRow = await prisma.userPreference.findUnique({
        where: { userId: q.userId },
      });
      const viewerPref: ViewerPreferenceLike = viewerPrefRow
        ? toViewerPreference(viewerPrefRow)
        : null;

      const viewerProfRow = await prisma.userProfile.findUnique({
        where: { userId: q.userId },
      });
      if (!viewerProfRow) {
        await prisma.batchMatchQueue.update({
          where: { id: q.id },
          data: { status: QUEUE_STATUS.FAILED },
        });
        failedCount++;
        logBatchLine({
          event: "queue_done",
          batchId: batch.id,
          queueId: q.id,
          viewerUserId: q.userId,
          outcome: "fail",
          reasonCode: REASON.VIEWER_PROFILE_MISSING,
        });
        continue;
      }
      const viewerProf = toProfileLike(viewerProfRow);

      const candidateIds = [
        ...new Set(pool.items.map((it) => it.candidateUserId)),
      ];
      const { userMap, profileMap, imageMap } =
        await loadCandidateContextMaps(prisma, candidateIds);

      type Scored = {
        item: (typeof pool.items)[number];
        components: ReturnType<typeof computeFinalScoreV1>;
        candidate: CandidateUserLike;
      };

      const scored: Scored[] = [];

      for (const item of pool.items) {
        const candidateUser = userMap.get(item.candidateUserId);
        if (!candidateUser) {
          logBatchLine({
            event: "item_skip",
            batchId: batch.id,
            queueId: q.id,
            viewerUserId: q.userId,
            candidateUserId: item.candidateUserId,
            reasonCode: REASON.CANDIDATE_CONTEXT_MISSING,
          });
          continue;
        }

        const candidateImage = imageMap.get(candidateUser.id) ?? null;
        const candidateProfRow = profileMap.get(candidateUser.id) ?? null;
        if (!candidateProfRow) {
          logBatchLine({
            event: "item_skip",
            batchId: batch.id,
            queueId: q.id,
            viewerUserId: q.userId,
            candidateUserId: item.candidateUserId,
            reasonCode: REASON.CANDIDATE_PROFILE_MISSING,
          });
          continue;
        }

        const components = computeFinalScoreV1({
          item: {
            baseScore: item.baseScore,
            rankInPool: item.rankInPool,
          },
          viewerPreference: viewerPref,
          viewerProfile: viewerProf,
          candidateUser: toCandidateUser(candidateUser),
          candidateImage: toImageLike(candidateImage),
          candidateProfile: toProfileLike(candidateProfRow),
        });

        scored.push({
          item,
          components,
          candidate: toCandidateUser(candidateUser),
        });
      }

      if (scored.length === 0) {
        await prisma.batchMatchQueue.update({
          where: { id: q.id },
          data: { status: QUEUE_STATUS.FAILED },
        });
        failedCount++;
        logBatchLine({
          event: "queue_done",
          batchId: batch.id,
          queueId: q.id,
          viewerUserId: q.userId,
          outcome: "fail",
          reasonCode: REASON.NO_SCORED_CANDIDATES,
        });
        continue;
      }

      scored.sort((a, b) => {
        const df = b.components.finalScore - a.components.finalScore;
        if (df !== 0) return df;
        return a.item.rankInPool - b.item.rankInPool;
      });

      const best = scored[0];

      const bestCandidateProfRow = profileMap.get(best.item.candidateUserId);
      const matchInsights = buildWorkerMatchInsightsForBestMatch({
        components: best.components,
        candidate: best.candidate,
        viewerProfile: viewerProf,
        candidateProfile: toProfileLike(bestCandidateProfRow ?? null),
      });

      await prisma.matchResult.create({
        data: {
          userId: q.userId,
          candidateUserId: best.item.candidateUserId,
          batchId: batch.id,
          finalScore: best.components.finalScore,
          reasonSummary: formatReasonSummaryV1(best.components),
          matchInsights,
          status: RESULT_STATUS_READY,
        },
      });

      await prisma.batchMatchQueue.update({
        where: { id: q.id },
        data: { status: QUEUE_STATUS.MATCHED },
      });
      successCount++;
      logBatchLine({
        event: "queue_done",
        batchId: batch.id,
        queueId: q.id,
        viewerUserId: q.userId,
        outcome: "ok",
        candidateUserId: best.item.candidateUserId,
        finalScore: best.components.finalScore,
      });
    }

    await prisma.matchBatch.update({
      where: { id: batch.id },
      data: {
        successCount,
        failedCount,
        status: BATCH_STATUS.COMPLETED,
      },
    });

    logBatchLine({
      event: "batch_complete",
      batchId: batch.id,
      successCount,
      failedCount,
    });
  } catch (e) {
    await prisma.matchBatch.update({
      where: { id: batch.id },
      data: { status: BATCH_STATUS.FAILED },
    });
    const msg = e instanceof Error ? e.message : String(e);
    logBatchLine({
      event: "batch_fatal",
      batchId: batch.id,
      reasonCode: REASON.UNEXPECTED_ERROR,
      error: msg.slice(0, 500),
    });
    throw e;
  } finally {
    await prisma.$disconnect();
  }
}
