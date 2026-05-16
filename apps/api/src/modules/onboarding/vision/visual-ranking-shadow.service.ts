/**
 * P7.5-r3: compute visual ranking shadow after pool generate (readonly).
 * P7.5-r5-c1: build shadow before pool items when APPLY allowlist writer may run.
 */

import { Injectable, Logger } from "@nestjs/common";
import type { ViewerPreferenceLike } from "@peima/shared/matching/preference-score";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  evaluateOnboardingVisionApplyEligibility,
  eligibilityOutcomeToApplyDryRunSummary,
  type OnboardingVisionApplyEligibilityOutcome,
} from "./onboarding-vision-apply-eligibility";
import { readOnboardingVisionApplyEnv } from "./onboarding-vision-apply-env";
import {
  buildApplyResultSummary,
  type OnboardingVisionApplyWriterDecision,
} from "./onboarding-vision-apply-writer-decision";
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
   */
  applyDryRunContext?: {
    viewerGenderRaw: string | null;
    poolGuardRows: OnboardingVisionApplyPoolGuardRow[];
  };
  /** P7.5-r5-c1: writer decision from pool generate (sets `summary.applyResult`). */
  writerDecision?: OnboardingVisionApplyWriterDecision;
  eligibility?: OnboardingVisionApplyEligibilityOutcome;
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

  /**
   * Build shadow in memory (no persist). Used before pool item create in r5-c1.
   */
  async buildForGenerate(
    input: VisualRankingShadowComputeInput,
    env: OnboardingVisionEnv = this.readEnv(),
    applyEnv = readOnboardingVisionApplyEnv(),
  ): Promise<
    | { computed: false; reason: "shadow_disabled" }
    | { computed: true; shadow: VisualRankingShadowV1 }
  > {
    if (!env.shadowEnabled) {
      return { computed: false, reason: "shadow_disabled" };
    }

    const shadow = await this.buildShadowPayload(input, env, applyEnv);
    return { computed: true, shadow };
  }

  async computeShadow(
    input: VisualRankingShadowComputeInput,
    env: OnboardingVisionEnv = this.readEnv(),
    applyEnv = readOnboardingVisionApplyEnv(),
  ): Promise<VisualRankingShadowComputeResult> {
    const built = await this.buildForGenerate(input, env, applyEnv);
    if (!built.computed) {
      return built;
    }

    const shadowWithMeta = attachApplyMetadata(
      {
        shadow: built.shadow,
        applyEnv,
        input,
      },
      (msg) => this.logger.warn(msg),
    );

    const persist = await persistVisualRankingShadow(
      this.prisma,
      input.poolId,
      input.viewerUserId,
      shadowWithMeta,
    );
    if (!persist.persisted) {
      this.logger.warn(
        `visual ranking shadow persist failed poolId=${input.poolId} reason=${persist.reason}${persist.message ? ` message=${persist.message}` : ""}`,
      );
    }

    return { computed: true, shadow: shadowWithMeta, persist };
  }

  private async buildShadowPayload(
    input: VisualRankingShadowComputeInput,
    env: OnboardingVisionEnv,
    applyEnv: ReturnType<typeof readOnboardingVisionApplyEnv>,
  ): Promise<VisualRankingShadowV1> {
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
      candidateImages.filter(
        (img) => img.userId !== input.viewerUserId,
      ) as UserImageVisionSourceRow[],
    );

    const viewerImages = candidateImages.filter(
      (img) => img.userId === input.viewerUserId,
    ) as UserImageVisionSourceRow[];
    const viewerVision = pickViewerPassingPhotoVision(viewerImages);

    const shadowCandidates = buildShadowCandidatesFromGatedRows(
      input.gatedCandidates,
      visionByUserId,
    );

    return buildVisualRankingShadowV1({
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
  }
}

function attachApplyMetadata(
  params: {
    shadow: VisualRankingShadowV1;
    applyEnv: ReturnType<typeof readOnboardingVisionApplyEnv>;
    input: VisualRankingShadowComputeInput;
  },
  logWarn?: (msg: string) => void,
): VisualRankingShadowV1 {
  const { shadow, applyEnv, input } = params;
  const ctx = input.applyDryRunContext;

  let applyDryRun = input.eligibility
    ? eligibilityOutcomeToApplyDryRunSummary(input.eligibility)
    : undefined;

  if (!applyDryRun) {
    try {
      const outcome = evaluateOnboardingVisionApplyEligibility({
        env: applyEnv,
        viewerUserId: input.viewerUserId,
        visualRankingShadow: shadow,
        poolGuardRows: ctx?.poolGuardRows ?? [],
        viewerGenderRaw: ctx?.viewerGenderRaw ?? null,
      });
      applyDryRun = eligibilityOutcomeToApplyDryRunSummary(outcome);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logWarn?.(
        `applyDryRun evaluation failed poolId=${input.poolId}: ${msg}`,
      );
      applyDryRun = {
        evaluated: true,
        eligible: false,
        reason: "shadow_invalid",
        applySourceVersion: applyEnv.applySourceVersion,
        appliedToPool: false,
      };
    }
  }

  const writer = input.writerDecision;
  const applyResult = writer
    ? buildApplyResultSummary({
        applied: writer.shouldApply,
        reason: writer.reason,
        sourceVersion: writer.applySourceVersion,
      })
    : undefined;

  return {
    ...shadow,
    poolId: input.poolId,
    summary: {
      ...shadow.summary,
      ...(applyDryRun ? { applyDryRun } : {}),
      ...(applyResult ? { applyResult } : {}),
    },
  };
}
