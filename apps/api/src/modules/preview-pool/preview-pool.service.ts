import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  PreviewPool,
  PreviewPoolItem,
  User,
  UserImage,
  UserPreference,
  UserProfile,
} from "@peima/database";
import { P1_DISCLAIMER, P1_MARK } from "@peima/shared/constants";
import {
  passesPreferenceHardGate,
  type PreferenceGateCandidate,
  type PreferenceGatePref,
} from "@peima/shared/matching/preference-hard-gate";
import type { ViewerPreferenceLike } from "@peima/shared/matching/preference-score";
import { PrismaService } from "../../common/prisma/prisma.service";
import { GeneratePreviewPoolDto } from "./dto/generate-preview-pool.dto";
import {
  assignLayeredSixUserIds,
  MAX_GATED_CANDIDATES,
  type GatedCandidateForLayering,
} from "./preview-pool-layered-selection";
import {
  applyPreviewVisualEnhanceStubGAll,
  buildPreviewVisualEnhanceClient,
  isPreviewVisualEnhanceEnabled,
  previewVisualEnhanceTimeoutMs,
} from "./visual-signal-enhance-stub";
import {
  buildPreviewPoolShortlistContractV0,
  type PreviewPoolShortlistContractV0,
} from "./preview-pool-shortlist-contract.v0";

const PREFERENCE_GATE_BATCH_SIZE = 50;

const POOL_STATUS = {
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;

/** Step 2: rank 1–2 visual, 3–4 preference (compat), 5–6 backup — aligned with P6 layered v0. */
const LAYER_SPECS: ReadonlyArray<{
  rankInPool: number;
  candidateType: string;
  displayMode: string;
  baseScore: number;
}> = [
  { rankInPool: 1, candidateType: "visual", displayMode: "full", baseScore: 0.8 },
  { rankInPool: 2, candidateType: "visual", displayMode: "full", baseScore: 0.79 },
  { rankInPool: 3, candidateType: "preference", displayMode: "full", baseScore: 0.7 },
  { rankInPool: 4, candidateType: "preference", displayMode: "full", baseScore: 0.69 },
  { rankInPool: 5, candidateType: "backup", displayMode: "locked", baseScore: 0.6 },
  { rankInPool: 6, candidateType: "backup", displayMode: "locked", baseScore: 0.59 },
];

/** P1-4 JSON on PreviewPoolItem; generated only from slot fields (no AI). */
export type PreviewPoolItemMeta = {
  slotReason: string;
  shortHint?: string;
  tags?: string[];
};

function buildItemMetaPlaceholder(
  spec: {
    rankInPool: number;
    candidateType: string;
    displayMode: string;
  },
  options?: { visualBorrowed?: boolean },
): PreviewPoolItemMeta {
  const tags = [spec.candidateType, spec.displayMode];
  let slotReason: string;
  if (spec.candidateType === "preference") {
    slotReason = `兼容排序槽${P1_MARK}：rank ${spec.rankInPool}，按账户偏好维度对齐度排序；展示模式为 ${spec.displayMode}。${P1_DISCLAIMER}`;
  } else if (spec.candidateType === "visual") {
    slotReason = `视觉分层槽${P1_MARK}：rank ${spec.rankInPool}，展示模式为 ${spec.displayMode}。${P1_DISCLAIMER}`;
    if (options?.visualBorrowed) {
      slotReason += ` 本槽为兼容排序借位补足（有图候选不足），视觉轻量信号较弱。`;
    }
  } else {
    slotReason = `备选槽${P1_MARK}：rank ${spec.rankInPool}，展示模式为 ${spec.displayMode}。${P1_DISCLAIMER}`;
  }
  const shortHint =
    spec.displayMode === "full"
      ? `本槽为完整展示层${P1_MARK}。`
      : spec.displayMode === "blurred"
        ? `本槽为弱化展示层${P1_MARK}。`
        : `本槽为锁定占位层${P1_MARK}。`;
  return { slotReason, shortHint, tags };
}

export type PreviewPoolBundle = {
  previewPool: PreviewPool;
  items: PreviewPoolItem[];
  /** Phase B v0：从 6 池派生的只读 shortlist contract（可选附加字段）。 */
  shortlistContract?: PreviewPoolShortlistContractV0;
};

export type { PreviewPoolShortlistContractV0 };

@Injectable()
export class PreviewPoolService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Phase C v0: read-only shortlistContract for a pool row (same rules as generate/latest attach).
   */
  async buildShortlistContractV0ForPool(
    viewerUserId: string,
    poolId: string,
  ): Promise<PreviewPoolShortlistContractV0 | undefined> {
    const pool = await this.prisma.previewPool.findFirst({
      where: { id: poolId, userId: viewerUserId },
      include: { items: { orderBy: { rankInPool: "asc" } } },
    });
    if (!pool?.items?.length) {
      return undefined;
    }
    return this.attachShortlistContractV0(viewerUserId, poolId, pool.items);
  }

  private async attachShortlistContractV0(
    viewerUserId: string,
    poolId: string,
    items: PreviewPoolItem[],
  ): Promise<PreviewPoolShortlistContractV0 | undefined> {
    if (!items.length) {
      return undefined;
    }

    const candidateIds = [...new Set(items.map((it) => it.candidateUserId))];

    const [prefRow, viewerProf, users, profiles, images] = await Promise.all([
      this.prisma.userPreference.findUnique({ where: { userId: viewerUserId } }),
      this.prisma.userProfile.findUnique({ where: { userId: viewerUserId } }),
      this.prisma.user.findMany({ where: { id: { in: candidateIds } } }),
      this.prisma.userProfile.findMany({ where: { userId: { in: candidateIds } } }),
      this.prisma.userImage.findMany({
        where: { userId: { in: candidateIds } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const candidateUserById = new Map<string, User>(users.map((u) => [u.id, u]));
    const candidateProfileById = new Map<string, UserProfile>(
      profiles.map((p) => [p.userId, p]),
    );

    const candidateFirstImageById = new Map<string, UserImage | null>();
    for (const img of images) {
      if (!candidateFirstImageById.has(img.userId)) {
        candidateFirstImageById.set(img.userId, img);
      }
    }
    for (const id of candidateIds) {
      if (!candidateFirstImageById.has(id)) {
        candidateFirstImageById.set(id, null);
      }
    }

    return buildPreviewPoolShortlistContractV0({
      viewerUserId,
      poolId,
      items,
      viewerPreference: prefRow,
      viewerProfile: viewerProf,
      candidateUserById,
      candidateProfileById,
      candidateFirstImageById,
    });
  }

  /** Maps DB row to gate input (`styleTags` excluded from step-1 gate). */
  private toPreferenceGatePref(row: UserPreference | null): PreferenceGatePref | null {
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

  /** Full preference row for `computePreferenceScore` / `computeStyleScore` (preview ordering only). */
  private toViewerPreferenceLike(row: UserPreference | null): ViewerPreferenceLike {
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

  private toPreferenceGateCandidate(row: {
    age: number | null;
    city: string;
    height: number | null;
    education: string;
    occupation: string;
    relationshipGoal: string;
  }): PreferenceGateCandidate {
    return {
      age: row.age,
      city: row.city,
      height: row.height,
      education: row.education,
      occupation: row.occupation,
      relationshipGoal: row.relationshipGoal,
    };
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  /**
   * Step 2: build bounded `G_all` — users passing Preference Gating v0 on the same baseline as before
   * (not self, has image, has relationProfile), up to `MAX_GATED_CANDIDATES` or table exhaustion.
   */
  private async collectGatedCandidates(
    viewerId: string,
    gatePref: PreferenceGatePref | null,
  ): Promise<GatedCandidateForLayering[]> {
    const baseWhere = {
      id: { not: viewerId },
      images: { some: {} },
      relationProfile: { isNot: null },
    };

    const out: GatedCandidateForLayering[] = [];
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
            select: { id: true, imageUrl: true, styleTags: true },
          },
        },
      });

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        if (out.length >= MAX_GATED_CANDIDATES) break;
        if (
          !passesPreferenceHardGate(
            gatePref,
            this.toPreferenceGateCandidate(row),
          )
        ) {
          continue;
        }

        const first = row.images[0];
        const hasImage = row.images.length > 0;
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
          firstImageId: first?.id ?? null,
          firstImageUrl: first?.imageUrl ?? null,
          hasImage,
        });
      }

      skip += PREFERENCE_GATE_BATCH_SIZE;
      if (rows.length < PREFERENCE_GATE_BATCH_SIZE) {
        break;
      }
    }

    return out;
  }

  private async archiveActivePoolsForUser(userId: string) {
    await this.prisma.previewPool.updateMany({
      where: { userId, status: POOL_STATUS.ACTIVE },
      data: { status: POOL_STATUS.ARCHIVED },
    });
  }

  async generate(dto: GeneratePreviewPoolDto): Promise<PreviewPoolBundle> {
    const { userId } = dto;
    await this.ensureUserExists(userId);

    const prefRow = await this.prisma.userPreference.findUnique({
      where: { userId },
    });
    const gatePref = this.toPreferenceGatePref(prefRow);
    const viewerPrefLike = this.toViewerPreferenceLike(prefRow);

    const gAll = await this.collectGatedCandidates(userId, gatePref);

    if (gAll.length < 6) {
      const otherUserCount = await this.prisma.user.count({
        where: { id: { not: userId } },
      });
      const othersWithImageCount = await this.prisma.user.count({
        where: { id: { not: userId }, images: { some: {} } },
      });
      const othersWithImageAndProfileCount = await this.prisma.user.count({
        where: {
          id: { not: userId },
          images: { some: {} },
          relationProfile: { isNot: null },
        },
      });
      throw new BadRequestException(
        `not enough candidates: need 6 other users each with at least one image and a questionnaire profile (user_profiles); ` +
          `eligible_gated_pool=${gAll.length}, others_with_image_and_profile=${othersWithImageAndProfileCount}, others_with_images_only=${othersWithImageCount}, other_users_total=${otherUserCount}. ` +
          `When preference gating is enabled, fewer users may satisfy both the profile/image baseline and your matching preference hard filters — widen preferences or add more eligible users.`,
      );
    }

    if (isPreviewVisualEnhanceEnabled()) {
      await applyPreviewVisualEnhanceStubGAll(
        gAll,
        buildPreviewVisualEnhanceClient(),
        previewVisualEnhanceTimeoutMs(),
      );
    }

    const layeredPicks = assignLayeredSixUserIds(gAll, viewerPrefLike);
    const pickByRank = new Map(
      layeredPicks.map((p) => [p.rankInPool, p]),
    );

    await this.archiveActivePoolsForUser(userId);

    const created = await this.prisma.previewPool.create({
      data: {
        userId,
        status: POOL_STATUS.ACTIVE,
        items: {
          create: LAYER_SPECS.map((spec) => {
            const pick = pickByRank.get(spec.rankInPool);
            if (!pick) {
              throw new Error(`Missing layered pick for rank ${spec.rankInPool}`);
            }
            const displayMode =
              pick.borrowedVisual && spec.candidateType === "visual"
                ? "blurred"
                : spec.displayMode;
            return {
              userId,
              candidateUserId: pick.candidateUserId,
              candidateType: spec.candidateType,
              displayMode,
              rankInPool: spec.rankInPool,
              baseScore: spec.baseScore,
              itemMeta: buildItemMetaPlaceholder(
                {
                  rankInPool: spec.rankInPool,
                  candidateType: spec.candidateType,
                  displayMode,
                },
                { visualBorrowed: pick.borrowedVisual },
              ),
            };
          }),
        },
      },
      include: {
        items: { orderBy: { rankInPool: "asc" } },
      },
    });

    const { items, ...previewPool } = created;
    const shortlistContract = await this.attachShortlistContractV0(
      userId,
      previewPool.id,
      items,
    );
    return { previewPool, items, shortlistContract };
  }

  async findLatestActiveForUser(viewerUserId: string): Promise<PreviewPoolBundle> {
    await this.ensureUserExists(viewerUserId);

    const pool = await this.prisma.previewPool.findFirst({
      where: { userId: viewerUserId, status: POOL_STATUS.ACTIVE },
      orderBy: { createdAt: "desc" },
      include: {
        items: { orderBy: { rankInPool: "asc" } },
      },
    });

    if (!pool) {
      throw new NotFoundException(
        `No active preview pool for user ${viewerUserId}`,
      );
    }

    const { items, ...previewPool } = pool;
    const shortlistContract = await this.attachShortlistContractV0(
      viewerUserId,
      previewPool.id,
      items,
    );
    return { previewPool, items, shortlistContract };
  }

  async remove(poolId: string, viewerUserId: string): Promise<void> {
    const existing = await this.prisma.previewPool.findFirst({
      where: { id: poolId, userId: viewerUserId },
    });
    if (!existing) {
      throw new NotFoundException(`Preview pool ${poolId} not found`);
    }
    await this.prisma.previewPool.delete({ where: { id: poolId } });
  }
}
