import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { isEligiblePreviewCandidate } from "../onboarding/onboarding-preview-candidate-eligibility";
import { isPreviewPoolAutoEnsureSyntheticFallbackEnabled } from "./preview-pool-auto-ensure.policy";

const POOL_STATUS_ACTIVE = "active";
const POOL_SLOT_COUNT = 6;

export type PreviewPoolGenerateSource =
  | "auto_ensure"
  | "test_preview_pool_seed";

export type PreviewPoolGenerateOptions = {
  source: PreviewPoolGenerateSource;
  /** When true, mark existing active pools as replaced before creating (test seed). */
  replaceExisting?: boolean;
  replacedStatus?: string;
  allowSyntheticFallback?: boolean;
};

function seededPhone(viewerUserId: string, n: number): string {
  return `preview-seed-${viewerUserId.slice(-10)}-${n}@peima.local`;
}

function slotMeta(source: PreviewPoolGenerateSource, rank: number) {
  const tier =
    rank <= 2 ? "visual" : rank <= 4 ? "preference" : "backup";
  const shortHint =
    source === "test_preview_pool_seed"
      ? "用于本地 smoke test，不写 MatchResult。"
      : "首次访问时自动生成的预览池，候选不足时会补充本地占位用户。";
  return {
    source,
    slotReason:
      source === "test_preview_pool_seed"
        ? `本地测试预览池候选 ${rank}`
        : `自动预览池候选 ${rank}`,
    shortHint,
    tags: [source, tier],
  };
}

@Injectable()
export class PreviewPoolGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUserExists(viewerUserId: string): Promise<void> {
    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerUserId },
      select: { id: true },
    });
    if (!viewer) {
      throw new NotFoundException(`User ${viewerUserId} not found`);
    }
  }

  private async findActivePoolId(viewerUserId: string): Promise<string | null> {
    const pool = await this.prisma.previewPool.findFirst({
      where: { userId: viewerUserId, status: POOL_STATUS_ACTIVE },
      orderBy: { createdAt: "desc" },
      include: { items: { select: { id: true } } },
    });
    if (!pool || pool.items.length === 0) {
      return null;
    }
    return pool.id;
  }

  private async listEligibleCandidateIds(
    viewerUserId: string,
    take: number,
  ): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        id: { not: viewerUserId },
        relationProfile: { isNot: null },
        images: { some: {} },
      },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true },
    });
    return rows
      .map((r) => r.id)
      .filter((id) => isEligiblePreviewCandidate(id, viewerUserId));
  }

  private async ensureSyntheticCandidate(
    viewerUserId: string,
    n: number,
  ): Promise<string> {
    const phone = seededPhone(viewerUserId, n);
    const user = await this.prisma.user.upsert({
      where: { phone },
      create: {
        phone,
        nickname: `预览候选 ${n}`,
        gender: n % 2 === 0 ? "female" : "male",
        age: 24 + n,
        city: n % 2 === 0 ? "Shanghai" : "Beijing",
        height: 165 + n,
        education: "bachelor",
        occupation: "product",
        relationshipGoal: "long_term",
        bio: "Auto-generated preview-pool candidate.",
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

  private async resolveCandidateIds(
    viewerUserId: string,
    allowSyntheticFallback: boolean,
  ): Promise<string[]> {
    const candidateIds = await this.listEligibleCandidateIds(
      viewerUserId,
      POOL_SLOT_COUNT * 2,
    );

    if (allowSyntheticFallback) {
      for (let n = 1; candidateIds.length < POOL_SLOT_COUNT; n += 1) {
        const id = await this.ensureSyntheticCandidate(viewerUserId, n);
        if (
          isEligiblePreviewCandidate(id, viewerUserId) &&
          !candidateIds.includes(id)
        ) {
          candidateIds.push(id);
        }
      }
    }

    return candidateIds.slice(0, POOL_SLOT_COUNT);
  }

  /**
   * Create an active 6-slot pool when the viewer has none (or when replaceExisting).
   * Returns whether a new pool was written and its id (if any).
   */
  async ensureActivePool(
    viewerUserId: string,
    options: PreviewPoolGenerateOptions,
  ): Promise<{ created: boolean; poolId: string | null }> {
    await this.ensureUserExists(viewerUserId);

    const replaceExisting = options.replaceExisting === true;
    if (!replaceExisting) {
      const existingId = await this.findActivePoolId(viewerUserId);
      if (existingId) {
        return { created: false, poolId: existingId };
      }
    }

    const allowSynthetic =
      options.allowSyntheticFallback ??
      isPreviewPoolAutoEnsureSyntheticFallbackEnabled();

    const selected = await this.resolveCandidateIds(
      viewerUserId,
      allowSynthetic,
    );

    if (selected.length < POOL_SLOT_COUNT) {
      throw new BadRequestException(
        `Not enough preview candidates (${selected.length}/${POOL_SLOT_COUNT}). ` +
          "Add more users with profile + photo, or enable synthetic fallback.",
      );
    }

    const replacedStatus =
      options.replacedStatus ??
      (options.source === "test_preview_pool_seed"
        ? "replaced_by_test_seed"
        : "replaced_by_auto_ensure");

    const poolId = await this.prisma.$transaction(async (tx) => {
      await tx.previewPool.updateMany({
        where: { userId: viewerUserId, status: POOL_STATUS_ACTIVE },
        data: { status: replacedStatus },
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
            candidateType:
              rank <= 2 ? "visual" : rank <= 4 ? "preference" : "backup",
            displayMode: "full",
            rankInPool: rank,
            baseScore: 1 - index * 0.06,
            itemMeta: slotMeta(options.source, rank),
          };
        }),
      });

      return pool.id;
    });

    return { created: true, poolId };
  }
}
