/**
 * P7.5-r3: compute visual ranking shadow after pool generate (readonly).
 */

import { Injectable, Logger } from "@nestjs/common";
import type { ViewerPreferenceLike } from "@peima/shared/matching/preference-score";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  evaluateOnboardingVisionApplyEligibility,
  eligibilityOutcomeToApplyDryRunSummary,
} from "./onboarding-vision-apply-eligibility";
import { readOnboardingVisionApplyEnv } from "./onboarding-vision-apply-env";
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
  persistVisualRankingShadow,
  type VisualRankingShadowPersistResult,
} from "./visual-ranking-shadow-persist";
import type { VisualRankingShadowV1 } from "./visual-ranking-shadow.types";
import type { OnboardingVisionApplyPoolGuardRow } from "./onboarding-vision-apply-eligibility";

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
  /**
   * When set, P7.5-r5-b persists `summary.applyDryRun` using r4-o2-aligned baseline guards.
   * Omitted in tests / callers that do not need dry-run metadata.
   */
  applyDryRunContext?: {
    viewerGenderRaw: string | null;
    poolGuardRows: OnboardingVisionApplyPoolGuardRow[];
  };
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
    applyEnv = readOnboardingVisionApplyEnv(),
  ): Promise<VisualRankingShadowComputeResult> {
    if (!env.shadowEnabled) {
      return { computed: false, reason: "shadow_disabled" };
    }

    if (applyEnv.applyToPoolEnabled) {
      this.logger.warn(
        "PEIMA_ONBOARDING_VISION_APPLY_TO_POOL=1: real pool items unchanged (P7.5-r5-b dry-run only); see shadow.summary.applyDryRun",
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
      applyToPoolIgnoredHint: applyEnv.applyToPoolEnabled,
    });

    const shadowWithDryRun = attachApplyDryRunMetadata(
      { shadow, applyEnv, input },
      (msg) => this.logger.warn(msg),
    );

    const persist = await persistVisualRankingShadow(
      this.prisma,
      input.poolId,
      input.viewerUserId,
      shadowWithDryRun,
    );
    if (!persist.persisted) {
      this.logger.warn(
        `visual ranking shadow persist failed poolId=${input.poolId} reason=${persist.reason}${persist.message ? ` message=${persist.message}` : ""}`,
      );
    }

    return { computed: true, shadow: shadowWithDryRun, persist };
  }
}

function attachApplyDryRunMetadata(
  params: {
    shadow: VisualRankingShadowV1;
    applyEnv: ReturnType<typeof readOnboardingVisionApplyEnv>;
    input: VisualRankingShadowComputeInput;
  },
  logWarn?: (msg: string) => void,
): VisualRankingShadowV1 {
  const { shadow, applyEnv, input } = params;
  const ctx = input.applyDryRunContext;
  try {
    const outcome = evaluateOnboardingVisionApplyEligibility({
      env: applyEnv,
      viewerUserId: input.viewerUserId,
      visualRankingShadow: shadow,
      poolGuardRows: ctx?.poolGuardRows ?? [],
      viewerGenderRaw: ctx?.viewerGenderRaw ?? null,
    });
    return {
      ...shadow,
      summary: {
        ...shadow.summary,
        applyDryRun: eligibilityOutcomeToApplyDryRunSummary(outcome),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logWarn?.(
      `applyDryRun evaluation failed poolId=${input.poolId}: ${msg}`,
    );
    return {
      ...shadow,
      summary: {
        ...shadow.summary,
        applyDryRun: {
          evaluated: true,
          eligible: false,
          reason: "shadow_invalid",
          applySourceVersion: applyEnv.applySourceVersion,
          appliedToPool: false,
        },
      },
    };
  }
}
