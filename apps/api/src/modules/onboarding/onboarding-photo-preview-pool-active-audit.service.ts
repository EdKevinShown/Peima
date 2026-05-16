import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { buildActivePoolAuditReport } from "./onboarding-photo-preview-pool-active-audit";

const ONBOARDING_POOL_STATUS = { ACTIVE: "active" } as const;

@Injectable()
export class OnboardingPhotoPreviewPoolActiveAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads latest active onboarding photo preview pool for viewer and builds a privacy-safe audit report.
   */
  async auditActivePoolForViewer(
    viewerUserId: string,
    mappingItems: Array<{ file: string; gender?: string }>,
  ) {
    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerUserId },
      select: { gender: true },
    });
    if (!viewer) {
      throw new NotFoundException("未找到当前用户，请重新登录后再试。");
    }

    const pool = await this.prisma.onboardingPhotoPreviewPool.findFirst({
      where: { userId: viewerUserId, status: ONBOARDING_POOL_STATUS.ACTIVE },
      orderBy: { createdAt: "desc" },
      include: {
        items: { orderBy: { rankInPool: "asc" } },
      },
    });

    if (!pool?.items?.length) {
      return buildActivePoolAuditReport({
        viewerUserId,
        viewerGenderRaw: viewer.gender,
        pool: null,
        items: [],
        mappingItems,
      });
    }

    const candIdsSorted = [...new Set(pool.items.map((i) => i.candidateUserId))].sort();
    const firstUrlByUser = new Map<string, string | null>();
    await Promise.all(
      candIdsSorted.map(async (cid) => {
        const im = await this.prisma.userImage.findFirst({
          where: { userId: cid },
          orderBy: { createdAt: "asc" },
          select: { imageUrl: true },
        });
        firstUrlByUser.set(cid, im?.imageUrl ?? null);
      }),
    );

    const users =
      candIdsSorted.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: candIdsSorted } },
            select: { id: true, gender: true },
          });
    const genderById = new Map(users.map((u) => [u.id, u.gender]));

    const items = pool.items.map((it) => ({
      rankInPool: it.rankInPool,
      tier: it.tier,
      displayMode: it.displayMode,
      candidateUserId: it.candidateUserId,
      candidateGenderRaw: genderById.get(it.candidateUserId) ?? null,
      firstImageUrl: firstUrlByUser.get(it.candidateUserId) ?? null,
    }));

    return buildActivePoolAuditReport({
      viewerUserId,
      viewerGenderRaw: viewer.gender,
      pool: { id: pool.id, status: pool.status, sourceVersion: pool.sourceVersion },
      items,
      mappingItems,
    });
  }
}
