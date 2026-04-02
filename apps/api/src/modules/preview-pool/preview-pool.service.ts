import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PreviewPool, PreviewPoolItem } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { GeneratePreviewPoolDto } from "./dto/generate-preview-pool.dto";

const POOL_STATUS = {
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;

const LAYER_SPECS: ReadonlyArray<{
  rankInPool: number;
  candidateType: string;
  displayMode: string;
  baseScore: number;
}> = [
  { rankInPool: 1, candidateType: "preference", displayMode: "full", baseScore: 0.8 },
  { rankInPool: 2, candidateType: "preference", displayMode: "full", baseScore: 0.79 },
  { rankInPool: 3, candidateType: "visual", displayMode: "blurred", baseScore: 0.7 },
  { rankInPool: 4, candidateType: "visual", displayMode: "blurred", baseScore: 0.69 },
  { rankInPool: 5, candidateType: "backup", displayMode: "locked", baseScore: 0.6 },
  { rankInPool: 6, candidateType: "backup", displayMode: "locked", baseScore: 0.59 },
];

export type PreviewPoolBundle = {
  previewPool: PreviewPool;
  items: PreviewPoolItem[];
};

@Injectable()
export class PreviewPoolService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  private async pickSixCandidatesWithImages(viewerId: string) {
    return this.prisma.user.findMany({
      where: {
        id: { not: viewerId },
        images: { some: {} },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 6,
    });
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

    const candidates = await this.pickSixCandidatesWithImages(userId);
    if (candidates.length < 6) {
      throw new BadRequestException("not enough candidates");
    }

    await this.archiveActivePoolsForUser(userId);

    const created = await this.prisma.previewPool.create({
      data: {
        userId,
        status: POOL_STATUS.ACTIVE,
        items: {
          create: LAYER_SPECS.map((spec, i) => ({
            userId,
            candidateUserId: candidates[i].id,
            candidateType: spec.candidateType,
            displayMode: spec.displayMode,
            rankInPool: spec.rankInPool,
            baseScore: spec.baseScore,
          })),
        },
      },
      include: {
        items: { orderBy: { rankInPool: "asc" } },
      },
    });

    const { items, ...previewPool } = created;
    return { previewPool, items };
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
    return { previewPool, items };
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
