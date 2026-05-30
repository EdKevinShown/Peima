import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, User, UserImage, UserPreference } from "@peima/database";
import type { ViewerPreferenceLike } from "@peima/shared/matching/preference-score";
import { PrismaService } from "../../common/prisma/prisma.service";
import { previewPoolRowDisplaySourceKey } from "../onboarding/onboarding-photo-preview-display-image-key";
import { isEligiblePreviewCandidate } from "../onboarding/onboarding-preview-candidate-eligibility";
import {
  extractUsableVisionFromDetectionScoreJson,
  pickViewerPassingPhotoVision,
  type UserImageVisionSourceRow,
} from "../onboarding/vision/visual-ranking-shadow-vision-input";
import type { ShadowCandidateInput } from "../onboarding/vision/visual-ranking-shadow-scoring";
import { isPreviewPoolAutoEnsureSyntheticFallbackEnabled } from "./preview-pool-auto-ensure.policy";
import {
  assignPreviewPoolTier3121Slots,
  PREVIEW_POOL_TIER3121_LAYOUT_VERSION,
  type PreviewPoolTier3121Slot,
} from "./preview-pool-tier3121";

const POOL_STATUS_ACTIVE = "active";
const POOL_SLOT_COUNT = 6;
const MAX_CANDIDATE_SCAN = 200;

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

function slotItemMeta(
  source: PreviewPoolGenerateSource,
  slot: PreviewPoolTier3121Slot,
): Record<string, unknown> {
  const shortHint =
    source === "test_preview_pool_seed"
      ? "本地测试预览池（3+2+1）"
      : "自动预览池（3+2+1：审美契合×3 / 风格相似×2 / 回流×1）";
  return {
    source,
    layout: PREVIEW_POOL_TIER3121_LAYOUT_VERSION,
    slotReason: slot.slotReason,
    scoreReason: slot.scoreReason,
    shortHint,
    tags: [source, slot.candidateType, slot.displayMode],
  };
}

function userToShadowCandidate(
  user: User,
  firstImage: UserImage | null,
): ShadowCandidateInput {
  const vision = firstImage
    ? extractUsableVisionFromDetectionScoreJson(
        firstImage.detectionScoreJson,
        firstImage.reviewStatus,
      )
    : null;
  return {
    userId: user.id,
    createdAt: user.createdAt,
    displaySourceKey: previewPoolRowDisplaySourceKey({
      id: user.id,
      firstImageUrl: firstImage?.imageUrl ?? null,
    }),
    styleTags: firstImage?.styleTags ?? [],
    vision,
    preferenceFields: {
      age: user.age,
      city: user.city,
      height: user.height,
      education: user.education,
      occupation: user.occupation,
      relationshipGoal: user.relationshipGoal,
    },
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

  private async loadShadowCandidatePool(
    viewerUserId: string,
  ): Promise<ShadowCandidateInput[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        id: { not: viewerUserId },
        relationProfile: { isNot: null },
        images: { some: {} },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_CANDIDATE_SCAN,
      include: {
        images: { orderBy: { createdAt: "asc" }, take: 1 },
      },
    });

    const out: ShadowCandidateInput[] = [];
    for (const row of rows) {
      if (!isEligiblePreviewCandidate(row.id, viewerUserId)) continue;
      out.push(userToShadowCandidate(row, row.images[0] ?? null));
    }
    return out;
  }

  private async loadViewerTier3121Context(viewerUserId: string): Promise<{
    viewerPref: ViewerPreferenceLike;
    viewerStyleTags: string[];
    viewerPhotoVisualTags: string[] | null;
    viewerVisionAvailable: boolean;
  }> {
    const [prefRow, viewerImages] = await Promise.all([
      this.prisma.userPreference.findUnique({ where: { userId: viewerUserId } }),
      this.prisma.userImage.findMany({
        where: { userId: viewerUserId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          createdAt: true,
          detectionScoreJson: true,
          detectionStatus: true,
          reviewStatus: true,
        },
      }),
    ]);

    const viewerPref = toViewerPreferenceLike(prefRow);
    const viewerStyleTags = prefRow?.styleTags ?? [];
    const viewerVision = pickViewerPassingPhotoVision(
      viewerImages as UserImageVisionSourceRow[],
    );
    return {
      viewerPref,
      viewerStyleTags,
      viewerPhotoVisualTags: viewerVision?.photoVisualTags ?? null,
      viewerVisionAvailable: viewerVision != null,
    };
  }

  private async ensureSyntheticCandidate(
    viewerUserId: string,
    n: number,
  ): Promise<ShadowCandidateInput> {
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

    let firstImage = await this.prisma.userImage.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    if (!firstImage) {
      firstImage = await this.prisma.userImage.create({
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

    return userToShadowCandidate(user, firstImage);
  }

  private async resolveTier3121Slots(
    viewerUserId: string,
    allowSyntheticFallback: boolean,
  ): Promise<PreviewPoolTier3121Slot[]> {
    const ctx = await this.loadViewerTier3121Context(viewerUserId);
    let candidates = await this.loadShadowCandidatePool(viewerUserId);

    let slots = assignPreviewPoolTier3121Slots({
      candidates,
      ...ctx,
    });

    if (allowSyntheticFallback) {
      for (let n = 1; slots.length < POOL_SLOT_COUNT && n <= 12; n += 1) {
        const synth = await this.ensureSyntheticCandidate(viewerUserId, n);
        if (!candidates.some((c) => c.userId === synth.userId)) {
          candidates = [...candidates, synth];
        }
        slots = assignPreviewPoolTier3121Slots({
          candidates,
          ...ctx,
        });
      }
    }

    return slots;
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

    const slots = await this.resolveTier3121Slots(
      viewerUserId,
      allowSynthetic,
    );

    if (slots.length < POOL_SLOT_COUNT) {
      throw new BadRequestException(
        `Not enough preview candidates (${slots.length}/${POOL_SLOT_COUNT}). ` +
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
        data: slots.map((slot) => ({
          previewPoolId: pool.id,
          userId: viewerUserId,
          candidateUserId: slot.candidateUserId,
          candidateType: slot.candidateType,
          displayMode: slot.displayMode,
          rankInPool: slot.rankInPool,
          baseScore: slot.baseScore,
          itemMeta: slotItemMeta(options.source, slot) as Prisma.InputJsonValue,
        })),
      });

      return pool.id;
    });

    return { created: true, poolId };
  }
}
