/**
 * P7.10-r11 — legacy PreviewPool read-only (generate/writer path removed in r11).
 * Historical rows remain queryable for admin/shadow; batch-match writer gated by r9.
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

const POOL_STATUS = {
  ACTIVE: "active",
} as const;

export type PreviewPoolBundle = {
  previewPool: PreviewPool;
  items: PreviewPoolItem[];
  shortlistContract?: PreviewPoolShortlistContractV0;
};

export type { PreviewPoolShortlistContractV0 };

@Injectable()
export class PreviewPoolService {
  constructor(private readonly prisma: PrismaService) {}

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
