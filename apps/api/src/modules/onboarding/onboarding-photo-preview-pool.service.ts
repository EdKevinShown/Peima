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
import { readOnboardingPreviewPoolGateEnv } from "./onboarding-preview-pool-env";
import {
  isStrictBinaryPreviewGender,
  normalizeUserGenderForPreview,
} from "./onboarding-preview-gender";
import type { OnboardingPhotoPreviewPoolBundle } from "./onboarding-photo-preview-pool.types";

const POOL_STATUS_ACTIVE = "active";
const POOL_SOURCE_VERSION = "onboarding-photo-preview-v1";
const MAX_GATED_CANDIDATES = 200;

@Injectable()
export class OnboardingPhotoPreviewPoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visualRankingShadow: VisualRankingShadowService,
  ) {}

  private async assertReadyForGenerate(viewerUserId: string): Promise<void> {
    const gateEnv = readOnboardingPreviewPoolGateEnv();
    const user = await this.prisma.user.findUnique({
      where: { id: viewerUserId },
      select: {
        gender: true,
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
        "请先在「审美偏好」页保存照片审美偏好，再生成第一印象预览。",
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
        "请先上传并通过审核至少一张照片，再生成第一印象预览。",
      );
    }

    const viewerNorm = normalizeUserGenderForPreview(user.gender);
    if (!gateEnv.relaxGenderGate && !isStrictBinaryPreviewGender(viewerNorm)) {
      throw new BadRequestException(
        "请先在个人资料中填写性别（男或女），系统才能为你匹配异性预览对象。",
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

    const viewerVision = pickViewerPassingPhotoVision(
      ctx.viewerImages as UserImageVisionSourceRow[],
    );

    const shadowCandidates = buildShadowCandidatesFromGatedRows(
      gatedForShadow,
      visionByUserId,
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

    const gateEnv = readOnboardingPreviewPoolGateEnv();
    const gatedCount = ctx.candidates.length;
    const genderLabel = ctx.viewerGenderNorm ?? "未填写";
    if (slots.length < gateEnv.minSlots) {
      const hints: string[] = [];
      if (genderLabel === "未填写" && !gateEnv.relaxGenderGate) {
        hints.push("在个人资料填写性别（男/女）");
      }
      if (gatedCount < gateEnv.minSlots) {
        hints.push("请注册更多异性测试账号：上传照片、填性别、完成问卷");
      }
      const hintSuffix =
        hints.length > 0 ? `建议：${hints.join("；")}。` : "";
      throw new BadRequestException(
        `内测候选人不足，暂时无法生成 ${gateEnv.minSlots} 人预览（池位 ${slots.length}/${gateEnv.minSlots}，门闸通过 ${gatedCount} 人，你的性别：${genderLabel}）。${hintSuffix}`,
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
