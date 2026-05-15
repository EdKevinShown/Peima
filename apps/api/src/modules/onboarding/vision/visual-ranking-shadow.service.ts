/**
 * P7.5-r3: compute visual ranking shadow after pool generate (readonly).
 */

import { Injectable, Logger } from "@nestjs/common";
import type { ViewerPreferenceLike } from "@peima/shared/matching/preference-score";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  readOnboardingVisionEnv,
  type OnboardingVisionEnv,
} from "./onboarding-vision-env";
import {
  buildShadowCandidatesFromGatedRows,
  buildVisualRankingShadowV1,
  type BaselinePoolItemInput,
} from "./visual-ranking-shadow.builder";
import {
  firstUsableVisionByUserId,
  pickViewerPassingPhotoVision,
  type UserImageVisionSourceRow,
} from "./visual-ranking-shadow-vision-input";
import {
  persistVisualRankingShadowIfSupported,
  type VisualRankingShadowPersistResult,
} from "./visual-ranking-shadow-persist";
import type { VisualRankingShadowV1 } from "./visual-ranking-shadow.types";

export type VisualRankingShadowComputeInput = {
  viewerUserId: string;
  poolId: string;
  baselineItems: BaselinePoolItemInput[];
  gatedCandidates: Array<{
    id: string;
    createdAt: Date;
    firstImageStyleTags: string[];
    age: number | null;
    city: string;
    height: number | null;
    education: string;
    occupation: string;
    relationshipGoal: string;
  }>;
  viewerStyleTags: string[];
  viewerPref: ViewerPreferenceLike;
};

export type VisualRankingShadowComputeResult =
  | { computed: false; reason: "shadow_disabled" }
  | {
      computed: true;
      shadow: VisualRankingShadowV1;
      persist: VisualRankingShadowPersistResult;
    };

@Injectable()
export class VisualRankingShadowService {
  private readonly logger = new Logger(VisualRankingShadowService.name);

  constructor(private readonly prisma: PrismaService) {}

  readEnv(): OnboardingVisionEnv {
    return readOnboardingVisionEnv();
  }

  async computeShadow(
    input: VisualRankingShadowComputeInput,
    env: OnboardingVisionEnv = this.readEnv(),
  ): Promise<VisualRankingShadowComputeResult> {
    if (!env.shadowEnabled) {
      return { computed: false, reason: "shadow_disabled" };
    }

    if (env.applyToPool) {
      this.logger.warn(
        "PEIMA_ONBOARDING_VISION_APPLY_TO_POOL=true ignored in P7.5-r3; shadow is readonly",
      );
    }

    const candidateIds = input.gatedCandidates.map((c) => c.id);
    const candidateImages = await this.prisma.userImage.findMany({
      where: { userId: { in: [...candidateIds, input.viewerUserId] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        detectionScoreJson: true,
        detectionStatus: true,
        reviewStatus: true,
      },
    });

    const visionByUserId = firstUsableVisionByUserId(
      candidateImages.filter((img) => img.userId !== input.viewerUserId) as UserImageVisionSourceRow[],
    );

    const viewerImages = candidateImages.filter(
      (img) => img.userId === input.viewerUserId,
    ) as UserImageVisionSourceRow[];
    const viewerVision = pickViewerPassingPhotoVision(viewerImages);

    const shadowCandidates = buildShadowCandidatesFromGatedRows(
      input.gatedCandidates,
      visionByUserId,
    );

    const shadow = buildVisualRankingShadowV1({
      viewerUserId: input.viewerUserId,
      poolId: input.poolId,
      baselineItems: input.baselineItems,
      viewerStyleTags: input.viewerStyleTags,
      viewerPhotoVisualTags: viewerVision?.photoVisualTags ?? null,
      viewerVisionAvailable: viewerVision != null,
      candidates: shadowCandidates,
      viewerPref: input.viewerPref,
      env,
    });

    const persist = await persistVisualRankingShadowIfSupported(
      input.poolId,
      shadow,
    );

    return { computed: true, shadow, persist };
  }
}
