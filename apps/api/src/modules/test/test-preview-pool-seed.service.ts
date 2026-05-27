import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PreviewPoolService, type PreviewPoolBundle } from "../preview-pool/preview-pool.service";

const SEEDED_SOURCE = "test_preview_pool_seed";
const POOL_STATUS_ACTIVE = "active";
const POOL_STATUS_REPLACED = "replaced_by_test_seed";

function seededPhone(viewerUserId: string, n: number): string {
  return `preview-seed-${viewerUserId.slice(-10)}-${n}@peima.local`;
}

@Injectable()
export class TestPreviewPoolSeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly previewPoolService: PreviewPoolService,
  ) {}

  private async ensureSeedCandidate(viewerUserId: string, n: number): Promise<string> {
    const phone = seededPhone(viewerUserId, n);
    const user = await this.prisma.user.upsert({
      where: { phone },
      create: {
        phone,
        nickname: `测试候选 ${n}`,
        gender: n % 2 === 0 ? "female" : "male",
        age: 24 + n,
        city: n % 2 === 0 ? "Shanghai" : "Beijing",
        height: 165 + n,
        education: "bachelor",
        occupation: "product",
        relationshipGoal: "long_term",
        bio: "Local preview-pool seed candidate.",
      },
      update: {},
      select: { id: true },
    });

    await this.prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        socialEnergy: 0.45 + n * 0.04,
        emotionalExpression: 0.5,
        relationshipPace: 0.45,
        initiativeLevel: 0.5,
        decisionOrientation: 0.5,
        conflictResponse: 0.5,
        confidence: 0.8,
      },
      update: {},
    });

    const existingImage = await this.prisma.userImage.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!existingImage) {
      await this.prisma.userImage.create({
        data: {
          userId: user.id,
          imageUrl: `https://example.com/peima-preview-seed-${n}.jpg`,
          attractivenessScore: 0.65 + n * 0.02,
          styleTags: n % 2 === 0 ? ["clean", "warm"] : ["casual", "outdoor"],
          detectionStatus: "skipped",
          reviewStatus: "not_required",
        },
      });
    }

    return user.id;
  }

  async seedLatestForUser(viewerUserId: string): Promise<PreviewPoolBundle> {
    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerUserId },
      select: { id: true },
    });
    if (!viewer) {
      throw new NotFoundException(`User ${viewerUserId} not found`);
    }

    const existingCandidates = await this.prisma.user.findMany({
      where: {
        id: { not: viewerUserId },
        relationProfile: { isNot: null },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true },
    });

    const candidateIds = existingCandidates.map((u) => u.id);
    for (let n = 1; candidateIds.length < 6; n += 1) {
      const id = await this.ensureSeedCandidate(viewerUserId, n);
      if (!candidateIds.includes(id) && id !== viewerUserId) {
        candidateIds.push(id);
      }
    }

    const selected = candidateIds.slice(0, 6);
    await this.prisma.$transaction(async (tx) => {
      await tx.previewPool.updateMany({
        where: { userId: viewerUserId, status: POOL_STATUS_ACTIVE },
        data: { status: POOL_STATUS_REPLACED },
      });

      const pool = await tx.previewPool.create({
        data: {
          userId: viewerUserId,
          status: POOL_STATUS_ACTIVE,
        },
        select: { id: true },
      });

      await tx.previewPoolItem.createMany({
        data: selected.map((candidateUserId, index) => {
          const rank = index + 1;
          return {
            previewPoolId: pool.id,
            userId: viewerUserId,
            candidateUserId,
            candidateType: rank <= 2 ? "visual" : rank <= 4 ? "preference" : "backup",
            displayMode: "full",
            rankInPool: rank,
            baseScore: 1 - index * 0.06,
            itemMeta: {
              source: SEEDED_SOURCE,
              slotReason: `本地测试预览池候选 ${rank}`,
              shortHint: "用于本地 smoke test，不写 MatchResult。",
              tags: ["dev_seed", rank <= 2 ? "visual" : rank <= 4 ? "preference" : "backup"],
            },
          };
        }),
      });
    });

    return this.previewPoolService.findLatestActiveForUser(viewerUserId);
  }
}
