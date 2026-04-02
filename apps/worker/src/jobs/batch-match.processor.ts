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
    socialEnergy: row.socialEnergy,
    emotionalExpression: row.emotionalExpression,
    relationshipPace: row.relationshipPace,
    initiativeLevel: row.initiativeLevel,
    decisionOrientation: row.decisionOrientation,
    conflictResponse: row.conflictResponse,
  };
}

function toImageLike(row: UserImage | null): UserImageLike {
  if (!row) return null;
  return { styleTags: row.styleTags ?? [] };
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
    console.log(`[batch-match] batch ${batch.id} started`);
    const waiting = await prisma.batchMatchQueue.findMany({
      where: { status: QUEUE_STATUS.WAITING },
      orderBy: { createdAt: "asc" },
    });

    await prisma.matchBatch.update({
      where: { id: batch.id },
      data: { totalUsers: waiting.length },
    });

    let successCount = 0;
    let failedCount = 0;

    for (const q of waiting) {
      await prisma.batchMatchQueue.update({
        where: { id: q.id },
        data: { status: QUEUE_STATUS.PROCESSING, batchId: batch.id },
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
      const viewerProf = toProfileLike(viewerProfRow);

      type Scored = {
        item: (typeof pool.items)[number];
        components: ReturnType<typeof computeFinalScoreV1>;
      };

      const scored: Scored[] = [];

      for (const item of pool.items) {
        const candidateUser = await prisma.user.findUnique({
          where: { id: item.candidateUserId },
        });
        if (!candidateUser) {
          continue;
        }

        const candidateImage = await prisma.userImage.findFirst({
          where: { userId: candidateUser.id },
          orderBy: { createdAt: "desc" },
        });

        const candidateProfRow = await prisma.userProfile.findUnique({
          where: { userId: candidateUser.id },
        });

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

        scored.push({ item, components });
      }

      if (scored.length === 0) {
        await prisma.batchMatchQueue.update({
          where: { id: q.id },
          data: { status: QUEUE_STATUS.FAILED },
        });
        failedCount++;
        continue;
      }

      scored.sort((a, b) => {
        const df = b.components.finalScore - a.components.finalScore;
        if (df !== 0) return df;
        return a.item.rankInPool - b.item.rankInPool;
      });

      const best = scored[0];

      await prisma.matchResult.create({
        data: {
          userId: q.userId,
          candidateUserId: best.item.candidateUserId,
          batchId: batch.id,
          finalScore: best.components.finalScore,
          reasonSummary: formatReasonSummaryV1(best.components),
          status: RESULT_STATUS_READY,
        },
      });

      await prisma.batchMatchQueue.update({
        where: { id: q.id },
        data: { status: QUEUE_STATUS.MATCHED },
      });
      successCount++;
    }

    await prisma.matchBatch.update({
      where: { id: batch.id },
      data: {
        successCount,
        failedCount,
        status: BATCH_STATUS.COMPLETED,
      },
    });

    console.log(
      `[batch-match] batch ${batch.id} completed: ok=${successCount} failed=${failedCount}`,
    );
  } catch (e) {
    await prisma.matchBatch.update({
      where: { id: batch.id },
      data: { status: BATCH_STATUS.FAILED },
    });
    console.error(`[batch-match] batch ${batch.id} failed`);
    throw e;
  } finally {
    await prisma.$disconnect();
  }
}
