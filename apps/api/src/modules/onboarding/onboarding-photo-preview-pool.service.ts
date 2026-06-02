import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ViewerPreferenceLike } from "@peima/shared/matching/preference-score";
import { PrismaService } from "../../common/prisma/prisma.service";
import { isEligiblePreviewCandidate } from "./onboarding-preview-candidate-eligibility";
import {
  assignPreviewPoolTier3121Slots,
  PREVIEW_POOL_TIER3121_LAYOUT_VERSION,
} from "../preview-pool/preview-pool-tier3121";
import { buildShadowCandidatesFromGatedRows } from "./vision/visual-ranking-shadow.builder";
import {
  pickViewerPassingPhotoVision,
  type UsableCandidateVision,
  type UserImageVisionSourceRow,
} from "./vision/visual-ranking-shadow-vision-input";
import {
  loadPhotoVisualPoolAuditContext,
  pickP76CandidateUsableVision,
} from "./vision/p76-photovisual-first-pool-db-adapter";
import { VisualRankingShadowService } from "./vision/visual-ranking-shadow.service";
import type { OnboardingPhotoPreviewPoolBundle } from "./onboarding-photo-preview-pool.types";

const POOL_STATUS_ACTIVE = "active";
const POOL_SOURCE_VERSION = "onboarding-photo-preview-v1";
const MAX_GATED_CANDIDATES = 200;
const SLOT_COUNT = 6;

@Injectable()
export class OnboardingPhotoPreviewPoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visualRankingShadow: VisualRankingShadowService,
  ) {}

  private async assertReadyForGenerate(viewerUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: viewerUserId },
      select: {
        onboardingPhotoAestheticCompletedAt: true,
        images: {
          select: { detectionStatus: true, reviewStatus: true },
          take: 5,
        },
      },
    });
    if (!user) {
      throw new NotFoundException(`User ${viewerUserId} not found`);
    }
    if (user.onboardingPhotoAestheticCompletedAt == null) {
      throw new BadRequestException(
        "Complete onboarding photo preferences before generating the preview pool.",
      );
    }
    const hasPassing = user.images.some(
      (img) =>
        (img.detectionStatus || "").trim() === "passed" ||
        (img.reviewStatus || "").trim() === "approved" ||
        (img.reviewStatus || "").trim() === "not_required",
    );
    if (!hasPassing) {
      throw new BadRequestException(
        "Upload at least one passing onboarding photo before generating the preview pool.",
      );
    }
  }

  private toViewerPreferenceLike(
    pref: { styleTags: string[] } | null,
  ): ViewerPreferenceLike {
    if (!pref) return null;
    return {
      minAge: null,
      maxAge: null,
      preferredCities: [],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [],
      occupationPreferences: [],
      relationshipGoalPreferences: [],
      styleTags: pref.styleTags ?? [],
    };
  }

  private async buildTier3121Slots(viewerUserId: string) {
    const ctx = await loadPhotoVisualPoolAuditContext(this.prisma, {
      viewerUserId,
      limit: MAX_GATED_CANDIDATES,
    });

    const visionByUserId = new Map<string, UsableCandidateVision>();
    for (const [candidateUserId, imgs] of ctx.candidateImagesByUserId) {
      const vision = pickP76CandidateUsableVision(imgs);
      if (vision) {
        visionByUserId.set(candidateUserId, {
          photoVisualTags: vision.photoVisualTags,
          confidence:
            typeof vision.confidence === "number" && Number.isFinite(vision.confidence)
              ? vision.confidence
              : 0.35,
        });
      }
    }

    const gatedForShadow = ctx.candidates.map((row) => {
      const imgs = ctx.candidateImagesByUserId.get(row.candidateUserId) ?? [];
      const first = imgs[0];
      const pf = row.preferenceFields;
      return {
        id: row.candidateUserId,
        createdAt: first?.createdAt ?? new Date(0),
        firstImageStyleTags: row.candidateStyleTags,
        firstImageUrl: first?.id ? `image://${first.id}` : null,
        age: pf.age,
        city: pf.city,
        height: pf.height,
        education: pf.education,
        occupation: pf.occupation,
        relationshipGoal: pf.relationshipGoal,
      };
    });

    const shadowCandidates = buildShadowCandidatesFromGatedRows(
      gatedForShadow,
      visionByUserId,
    );

    const viewerVision = pickViewerPassingPhotoVision(
      ctx.viewerImages as UserImageVisionSourceRow[],
    );

    const slots = assignPreviewPoolTier3121Slots({
      candidates: shadowCandidates,
      viewerStyleTags: ctx.viewerStyleTags,
      viewerPhotoVisualTags: viewerVision?.photoVisualTags ?? null,
      viewerVisionAvailable: viewerVision != null,
      viewerPref: this.toViewerPreferenceLike({
        styleTags: ctx.viewerStyleTags,
      }),
    });

    return { slots, ctx, gatedForShadow };
  }

  async generate(viewerUserId: string): Promise<OnboardingPhotoPreviewPoolBundle> {
    await this.assertReadyForGenerate(viewerUserId);

    const { slots, ctx, gatedForShadow } =
      await this.buildTier3121Slots(viewerUserId);

    if (slots.length < SLOT_COUNT) {
      throw new BadRequestException(
        `Not enough gated candidates for 3+2+1 pool (${slots.length}/${SLOT_COUNT}). Add more users with photos and profiles.`,
      );
    }

    const poolId = await this.prisma.$transaction(async (tx) => {
      await tx.onboardingPhotoPreviewPool.updateMany({
        where: { userId: viewerUserId, status: POOL_STATUS_ACTIVE },
        data: { status: "replaced" },
      });

      const pool = await tx.onboardingPhotoPreviewPool.create({
        data: {
          userId: viewerUserId,
          status: POOL_STATUS_ACTIVE,
          sourceVersion: POOL_SOURCE_VERSION,
        },
      });

      await tx.onboardingPhotoPreviewPoolItem.createMany({
        data: slots.map((slot) => ({
          poolId: pool.id,
          userId: viewerUserId,
          candidateUserId: slot.candidateUserId,
          tier: slot.candidateType,
          displayMode: slot.displayMode,
          rankInPool: slot.rankInPool,
          score: slot.baseScore,
          reasonTags: [
            ...slot.overlapStyleTags,
            slot.scoreReason,
            PREVIEW_POOL_TIER3121_LAYOUT_VERSION,
          ],
        })),
      });

      return pool.id;
    });

    const created = await this.prisma.onboardingPhotoPreviewPool.findUnique({
      where: { id: poolId },
      include: { items: { orderBy: { rankInPool: "asc" } } },
    });
    if (!created) {
      throw new NotFoundException("Failed to load created onboarding preview pool");
    }

    const baselineItems = created.items.map((it) => ({
      rankInPool: it.rankInPool,
      tier: it.tier,
      displayMode: it.displayMode,
      candidateUserId: it.candidateUserId,
      score: it.score,
    }));

    void this.visualRankingShadow
      .computeShadow({
        viewerUserId,
        poolId: created.id,
        baselineItems,
        gatedCandidates: gatedForShadow,
        viewerStyleTags: ctx.viewerStyleTags,
        viewerPref: this.toViewerPreferenceLike({
          styleTags: ctx.viewerStyleTags,
        }),
      })
      .catch(() => undefined);

    void import("../testing-observability/record-testing-event").then(({ recordTestingEvent }) =>
      recordTestingEvent(this.prisma, {
        userId: viewerUserId,
        eventType: "preview_pool_generated",
        status: "success",
        source: "onboarding_photo_preview_pool",
        sourceVersion: POOL_SOURCE_VERSION,
        meta: {
          poolId: created.id,
          itemCount: created.items.length,
        },
      }),
    );

    return this.toViewerBundle(created);
  }

  async findLatestActiveForViewer(
    viewerUserId: string,
  ): Promise<OnboardingPhotoPreviewPoolBundle> {
    const pool = await this.prisma.onboardingPhotoPreviewPool.findFirst({
      where: { userId: viewerUserId, status: POOL_STATUS_ACTIVE },
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { rankInPool: "asc" } } },
    });
    if (!pool?.items?.length) {
      throw new NotFoundException("No active onboarding photo preview pool");
    }
    return this.toViewerBundle(pool);
  }

  async acknowledgePreview(viewerUserId: string): Promise<{ acknowledgedAt: string }> {
    await this.prisma.user.update({
      where: { id: viewerUserId },
      data: { onboardingPhotoPreviewCompletedAt: new Date() },
    });
    return { acknowledgedAt: new Date().toISOString() };
  }

  private async toViewerBundle(
    pool: {
      id: string;
      userId: string;
      status: string;
      sourceVersion: string;
      createdAt: Date;
      updatedAt: Date;
      items: Array<{
        id: string;
        poolId: string;
        userId: string;
        candidateUserId: string;
        tier: string;
        displayMode: string;
        rankInPool: number;
        score: number | null;
        reasonTags: string[];
        createdAt: Date;
        updatedAt: Date;
      }>;
    },
  ): Promise<OnboardingPhotoPreviewPoolBundle> {
    const items = await Promise.all(
      pool.items.map(async (it) => {
        let candidateImageUrl: string | undefined;
        if (
          it.displayMode !== "hidden" &&
          isEligiblePreviewCandidate(it.candidateUserId, pool.userId)
        ) {
          const passing = await this.prisma.userImage.findFirst({
            where: {
              userId: it.candidateUserId,
              OR: [
                { detectionStatus: "passed" },
                { reviewStatus: { in: ["approved", "not_required"] } },
              ],
            },
            orderBy: { createdAt: "asc" },
            select: { imageUrl: true },
          });
          const fallback = passing
            ? null
            : await this.prisma.userImage.findFirst({
                where: { userId: it.candidateUserId },
                orderBy: { createdAt: "asc" },
                select: { imageUrl: true },
              });
          candidateImageUrl = (passing ?? fallback)?.imageUrl ?? undefined;
        }

        return {
          id: it.id,
          previewPoolId: it.poolId,
          userId: it.userId,
          candidateUserId: it.candidateUserId,
          candidateType: it.tier,
          displayMode: it.displayMode,
          rankInPool: it.rankInPool,
          baseScore: it.score,
          itemMeta: {
            slotReason: `tier=${it.tier}`,
            shortHint:
              it.tier === "aesthetic_fit"
                ? "审美契合"
                : it.tier === "style_similar"
                  ? "风格相似"
                  : "回流探索",
            tags: [...it.reasonTags, it.tier, it.displayMode],
            candidateImageUrl,
            reasonTags: it.reasonTags,
          },
          createdAt: it.createdAt.toISOString(),
          updatedAt: it.updatedAt.toISOString(),
        };
      }),
    );

    return {
      previewPool: {
        id: pool.id,
        userId: pool.userId,
        status: pool.status,
        sourceVersion: pool.sourceVersion,
        createdAt: pool.createdAt.toISOString(),
        updatedAt: pool.updatedAt.toISOString(),
      },
      items,
    };
  }
}
