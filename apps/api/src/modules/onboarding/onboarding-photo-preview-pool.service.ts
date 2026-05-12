import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { UserPreference } from "@peima/database";
import {
  passesPreferenceHardGate,
  type PreferenceGateCandidate,
  type PreferenceGatePref,
} from "@peima/shared/matching/preference-hard-gate";
import {
  computePreferenceScore,
  computeStyleScore,
  type ViewerPreferenceLike,
} from "@peima/shared/matching/preference-score";
import { PrismaService } from "../../common/prisma/prisma.service";

const ONBOARDING_POOL_STATUS = {
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;

export const ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION =
  "onboarding-photo-preview-v1" as const;

const PREFERENCE_GATE_BATCH_SIZE = 50;
const MAX_GATED_CANDIDATES = 200;

type GatedRow = {
  id: string;
  createdAt: Date;
  age: number | null;
  city: string;
  height: number | null;
  education: string;
  occupation: string;
  relationshipGoal: string;
  firstImageStyleTags: string[];
};

function toPreferenceGatePref(row: UserPreference | null): PreferenceGatePref | null {
  if (!row) return null;
  return {
    minAge: row.minAge,
    maxAge: row.maxAge,
    preferredCities: row.preferredCities ?? [],
    minHeight: row.minHeight,
    maxHeight: row.maxHeight,
    educationPreferences: row.educationPreferences ?? [],
    occupationPreferences: row.occupationPreferences ?? [],
    relationshipGoalPreferences: row.relationshipGoalPreferences ?? [],
  };
}

function toViewerPreferenceLike(row: UserPreference | null): ViewerPreferenceLike {
  if (!row) return null;
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

function toPreferenceGateCandidate(row: GatedRow): PreferenceGateCandidate {
  return {
    age: row.age,
    city: row.city,
    height: row.height,
    education: row.education,
    occupation: row.occupation,
    relationshipGoal: row.relationshipGoal,
  };
}

function toCandidateLike(row: GatedRow) {
  return {
    age: row.age,
    city: row.city,
    height: row.height,
    education: row.education,
    occupation: row.occupation,
    relationshipGoal: row.relationshipGoal,
  };
}

/** Pick `take` user ids by highest style score vs viewer tags; tie-break older registration first. */
function pickByStyleScore(
  gAll: GatedRow[],
  exclude: Set<string>,
  viewerPref: ViewerPreferenceLike,
  take: number,
): { id: string; score: number }[] {
  const pool = gAll.filter((c) => !exclude.has(c.id));
  const scored = pool.map((c) => ({
    id: c.id,
    score: computeStyleScore(viewerPref, {
      styleTags: c.firstImageStyleTags,
    }).score,
    createdAt: c.createdAt,
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return scored.slice(0, take).map((s) => ({ id: s.id, score: s.score }));
}

/** Pick `take` by preference dimension score; tie-break older registration first. */
function pickByPreferenceScore(
  gAll: GatedRow[],
  exclude: Set<string>,
  viewerPref: ViewerPreferenceLike,
  take: number,
): { id: string; score: number }[] {
  const pool = gAll.filter((c) => !exclude.has(c.id));
  const scored = pool.map((c) => ({
    id: c.id,
    score: computePreferenceScore(viewerPref, toCandidateLike(c)),
    createdAt: c.createdAt,
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return scored.slice(0, take).map((s) => ({ id: s.id, score: s.score }));
}

function pickOldest(
  gAll: GatedRow[],
  exclude: Set<string>,
): { id: string; score: number } | null {
  const pool = gAll.filter((c) => !exclude.has(c.id));
  if (pool.length === 0) return null;
  const ordered = [...pool].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const c = ordered[0];
  return { id: c.id, score: 0.4 };
}

export type OnboardingPhotoPreviewItemDto = {
  id: string;
  candidateUserId: string;
  tier: string;
  displayMode: string;
  rankInPool: number;
  score: number | null;
  reasonTags: string[];
  imageUrl?: string | null;
};

export type OnboardingPhotoPreviewPoolBundleDto = {
  pool: {
    id: string;
    userId: string;
    status: string;
    sourceVersion: string;
    createdAt: Date;
    updatedAt: Date;
  };
  items: OnboardingPhotoPreviewItemDto[];
};

@Injectable()
export class OnboardingPhotoPreviewPoolService {
  constructor(private readonly prisma: PrismaService) {}

  private async collectGatedCandidates(
    viewerId: string,
    gatePref: PreferenceGatePref | null,
  ): Promise<GatedRow[]> {
    const baseWhere = {
      id: { not: viewerId },
      images: { some: {} },
      relationProfile: { isNot: null },
    };

    const out: GatedRow[] = [];
    let skip = 0;

    while (out.length < MAX_GATED_CANDIDATES) {
      const rows = await this.prisma.user.findMany({
        where: baseWhere,
        orderBy: { createdAt: "asc" },
        skip,
        take: PREFERENCE_GATE_BATCH_SIZE,
        select: {
          id: true,
          createdAt: true,
          age: true,
          city: true,
          height: true,
          education: true,
          occupation: true,
          relationshipGoal: true,
          images: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { styleTags: true },
          },
        },
      });

      if (rows.length === 0) break;

      for (const row of rows) {
        if (out.length >= MAX_GATED_CANDIDATES) break;
        if (
          !passesPreferenceHardGate(
            gatePref,
            toPreferenceGateCandidate({
              id: row.id,
              createdAt: row.createdAt,
              age: row.age,
              city: row.city,
              height: row.height,
              education: row.education,
              occupation: row.occupation,
              relationshipGoal: row.relationshipGoal,
              firstImageStyleTags: row.images[0]?.styleTags ?? [],
            }),
          )
        ) {
          continue;
        }

        const first = row.images[0];
        out.push({
          id: row.id,
          createdAt: row.createdAt,
          age: row.age,
          city: row.city,
          height: row.height,
          education: row.education,
          occupation: row.occupation,
          relationshipGoal: row.relationshipGoal,
          firstImageStyleTags: first?.styleTags ?? [],
        });
      }

      skip += PREFERENCE_GATE_BATCH_SIZE;
      if (rows.length < PREFERENCE_GATE_BATCH_SIZE) break;
    }

    return out;
  }

  private async archiveActiveOnboardingPoolsOnly(viewerUserId: string) {
    await this.prisma.onboardingPhotoPreviewPool.updateMany({
      where: { userId: viewerUserId, status: ONBOARDING_POOL_STATUS.ACTIVE },
      data: { status: ONBOARDING_POOL_STATUS.ARCHIVED },
    });
  }

  /**
   * Build 3+2+1 onboarding preview items (does not touch `preview_pools`).
   */
  async generate(viewerUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: viewerUserId },
      select: {
        onboardingPhotoAestheticCompletedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException(`User ${viewerUserId} not found`);
    }
    if (!user.onboardingPhotoAestheticCompletedAt) {
      throw new BadRequestException(
        "complete onboarding photo preferences before generating the preview pool",
      );
    }

    const imageCount = await this.prisma.userImage.count({
      where: { userId: viewerUserId },
    });
    if (imageCount < 1) {
      throw new BadRequestException("upload at least one photo before generating the preview pool");
    }

    const prefRow = await this.prisma.userPreference.findUnique({
      where: { userId: viewerUserId },
    });
    const gatePref = toPreferenceGatePref(prefRow);
    const viewerPref = toViewerPreferenceLike(prefRow);

    const gAll = await this.collectGatedCandidates(viewerUserId, gatePref);
    if (gAll.length < 6) {
      throw new BadRequestException(
        `not enough candidates for onboarding preview pool: need 6 other users with image + questionnaire profile; gated=${gAll.length}`,
      );
    }

    const used = new Set<string>();
    const aesthetic = pickByStyleScore(gAll, used, viewerPref, 3);
    for (const { id } of aesthetic) used.add(id);

    const styleSimilar = pickByPreferenceScore(gAll, used, viewerPref, 2);
    for (const { id } of styleSimilar) used.add(id);

    const reflow = pickOldest(gAll, used);
    if (!reflow) {
      throw new BadRequestException("could not assign reflow slot (candidate pool exhausted)");
    }
    used.add(reflow.id);

    if (used.size !== 6) {
      throw new BadRequestException("internal: expected 6 unique candidate ids");
    }

    const slotDefs: {
      rankInPool: number;
      tier: string;
      displayMode: string;
      candidateId: string;
      score: number;
    }[] = [
      { rankInPool: 1, tier: "aesthetic_fit", displayMode: "clear", candidateId: aesthetic[0].id, score: aesthetic[0].score },
      { rankInPool: 2, tier: "aesthetic_fit", displayMode: "clear", candidateId: aesthetic[1].id, score: aesthetic[1].score },
      { rankInPool: 3, tier: "aesthetic_fit", displayMode: "clear", candidateId: aesthetic[2].id, score: aesthetic[2].score },
      { rankInPool: 4, tier: "style_similar", displayMode: "blurred", candidateId: styleSimilar[0].id, score: styleSimilar[0].score },
      { rankInPool: 5, tier: "style_similar", displayMode: "blurred", candidateId: styleSimilar[1].id, score: styleSimilar[1].score },
      { rankInPool: 6, tier: "reflow", displayMode: "hidden", candidateId: reflow.id, score: reflow.score },
    ];

    await this.archiveActiveOnboardingPoolsOnly(viewerUserId);

    const created = await this.prisma.onboardingPhotoPreviewPool.create({
      data: {
        userId: viewerUserId,
        status: ONBOARDING_POOL_STATUS.ACTIVE,
        sourceVersion: ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION,
        items: {
          create: slotDefs.map((s) => ({
            userId: viewerUserId,
            candidateUserId: s.candidateId,
            tier: s.tier,
            displayMode: s.displayMode,
            rankInPool: s.rankInPool,
            score: s.score,
            reasonTags: [
              `onboarding-photo-preview-v1`,
              `tier:${s.tier}`,
            ],
          })),
        },
      },
      include: {
        items: { orderBy: { rankInPool: "asc" } },
      },
    });

    return this.toViewerBundle(created);
  }

  private async toViewerBundle(
    pool: {
      id: string;
      userId: string;
      status: string;
      sourceVersion: string;
      createdAt: Date;
      updatedAt: Date;
      items: {
        id: string;
        candidateUserId: string;
        tier: string;
        displayMode: string;
        rankInPool: number;
        score: number | null;
        reasonTags: string[];
      }[];
    },
  ): Promise<OnboardingPhotoPreviewPoolBundleDto> {
    const candidateIds = [...new Set(pool.items.map((i) => i.candidateUserId))];
    const images = await this.prisma.userImage.findMany({
      where: { userId: { in: candidateIds } },
      orderBy: { createdAt: "asc" },
    });
    const firstImageUrlByUser = new Map<string, string>();
    for (const img of images) {
      if (!firstImageUrlByUser.has(img.userId)) {
        firstImageUrlByUser.set(img.userId, img.imageUrl);
      }
    }

    const items: OnboardingPhotoPreviewItemDto[] = pool.items.map((it) => {
      const base: OnboardingPhotoPreviewItemDto = {
        id: it.id,
        candidateUserId: it.candidateUserId,
        tier: it.tier,
        displayMode: it.displayMode,
        rankInPool: it.rankInPool,
        score: it.score,
        reasonTags: it.reasonTags ?? [],
      };
      if (it.displayMode === "hidden") {
        return base;
      }
      const url = firstImageUrlByUser.get(it.candidateUserId) ?? null;
      return { ...base, imageUrl: url };
    });

    return {
      pool: {
        id: pool.id,
        userId: pool.userId,
        status: pool.status,
        sourceVersion: pool.sourceVersion,
        createdAt: pool.createdAt,
        updatedAt: pool.updatedAt,
      },
      items,
    };
  }

  async findLatestActiveForViewer(
    viewerUserId: string,
  ): Promise<OnboardingPhotoPreviewPoolBundleDto> {
    const pool = await this.prisma.onboardingPhotoPreviewPool.findFirst({
      where: { userId: viewerUserId, status: ONBOARDING_POOL_STATUS.ACTIVE },
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { rankInPool: "asc" } } },
    });
    if (!pool?.items?.length) {
      throw new NotFoundException(
        `No active onboarding photo preview pool for user ${viewerUserId}`,
      );
    }
    return this.toViewerBundle(pool);
  }

  /**
   * Marks onboarding photo preview as done; requires an active onboarding pool with 6 items.
   */
  async acknowledge(viewerUserId: string): Promise<{ ok: true }> {
    const pool = await this.prisma.onboardingPhotoPreviewPool.findFirst({
      where: { userId: viewerUserId, status: ONBOARDING_POOL_STATUS.ACTIVE },
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });
    if (!pool || pool.items.length !== 6) {
      throw new BadRequestException(
        "active onboarding photo preview pool with 6 items is required before continuing",
      );
    }
    await this.prisma.user.update({
      where: { id: viewerUserId },
      data: { onboardingPhotoPreviewCompletedAt: new Date() },
    });
    return { ok: true };
  }
}
