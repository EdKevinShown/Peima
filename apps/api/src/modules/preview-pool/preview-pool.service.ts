/**
 * P7.10-r11 — legacy PreviewPool read path (formal writer removed in r11).
 * When no active pool exists, optional lazy ensure creates one on GET latest.
 */
import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  PreviewPool,
  PreviewPoolItem,
  User,
  UserImage,
  UserPreference,
  UserProfile,
} from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  buildPreviewPoolShortlistContractV0,
  type PreviewPoolShortlistContractV0,
} from "./preview-pool-shortlist-contract.v0";
import { isPreviewPoolAutoEnsureEnabled } from "./preview-pool-auto-ensure.policy";
import { PreviewPoolGeneratorService } from "./preview-pool-generator.service";

const POOL_STATUS = {
  ACTIVE: "active",
} as const;

export type PreviewPoolBundle = {
  previewPool: PreviewPool;
  items: PreviewPoolItem[];
  shortlistContract?: PreviewPoolShortlistContractV0;
};

export type { PreviewPoolShortlistContractV0 };

function mergeItemMetaWithImageUrl(
  item: PreviewPoolItem,
  candidateImageUrl: string | null,
): PreviewPoolItem {
  const baseMeta =
    item.itemMeta && typeof item.itemMeta === "object" ? item.itemMeta : {};
  if (!candidateImageUrl) {
    return item;
  }
  return {
    ...item,
    itemMeta: {
      ...(baseMeta as Record<string, unknown>),
      candidateImageUrl,
    },
  };
}

@Injectable()
export class PreviewPoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly previewPoolGenerator: PreviewPoolGeneratorService,
  ) {}

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

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  async findLatestActiveForUser(viewerUserId: string): Promise<PreviewPoolBundle> {
    await this.ensureUserExists(viewerUserId);

    let pool = await this.prisma.previewPool.findFirst({
      where: { userId: viewerUserId, status: POOL_STATUS.ACTIVE },
      orderBy: { createdAt: "desc" },
      include: {
        items: { orderBy: { rankInPool: "asc" } },
      },
    });

    if ((!pool || pool.items.length === 0) && isPreviewPoolAutoEnsureEnabled()) {
      await this.previewPoolGenerator.ensureActivePool(viewerUserId, {
        source: "auto_ensure",
        replaceExisting: false,
      });
      pool = await this.prisma.previewPool.findFirst({
        where: { userId: viewerUserId, status: POOL_STATUS.ACTIVE },
        orderBy: { createdAt: "desc" },
        include: {
          items: { orderBy: { rankInPool: "asc" } },
        },
      });
    }

    if (!pool || pool.items.length === 0) {
      throw new NotFoundException(
        `No active preview pool for user ${viewerUserId}`,
      );
    }

    const { items, ...previewPool } = pool;
    const candidateIds = [...new Set(items.map((it) => it.candidateUserId))];
    const latestCandidateImages = await this.prisma.userImage.findMany({
      where: { userId: { in: candidateIds } },
      orderBy: [{ userId: "asc" }, { createdAt: "desc" }],
      select: { userId: true, imageUrl: true },
    });
    const imageUrlByCandidateId = new Map<string, string>();
    for (const row of latestCandidateImages) {
      if (!imageUrlByCandidateId.has(row.userId)) {
        imageUrlByCandidateId.set(row.userId, row.imageUrl);
      }
    }
    const enrichedItems = items.map((it) =>
      mergeItemMetaWithImageUrl(
        it,
        imageUrlByCandidateId.get(it.candidateUserId) ?? null,
      ),
    );
    const shortlistContract = await this.attachShortlistContractV0(
      viewerUserId,
      previewPool.id,
      enrichedItems,
    );
    return { previewPool, items: enrichedItems, shortlistContract };
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
