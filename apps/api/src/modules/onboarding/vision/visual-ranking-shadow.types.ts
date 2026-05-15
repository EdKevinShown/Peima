/**
 * P7.5-r3: readonly visual ranking shadow (hypothetical 3+2+1 vs baseline).
 */

export const VISUAL_RANKING_SHADOW_SCHEMA_VERSION =
  "visual-ranking-shadow-v1" as const;

export const VISUAL_RANKING_SHADOW_SOURCE_VERSION =
  "p7.5-r3-visual-ranking-shadow-v1" as const;

export const VISUAL_RANKING_SHADOW_BASELINE_SOURCE_VERSION =
  "onboarding-photo-preview-v1" as const;

export const VISUAL_RANKING_SHADOW_HYPOTHETICAL_SOURCE_VERSION =
  "onboarding-photo-preview-v1-vision-shadow" as const;

export type VisualRankingShadowTier =
  | "aesthetic_fit"
  | "style_similar"
  | "reflow";

export type VisualRankingShadowSlotReason =
  | "aesthetic_tag_overlap"
  | "style_tag_similarity"
  | "reflow_explore_baseline"
  | "vision_fallback_baseline"
  | "vision_unavailable";

export type VisualRankingShadowSlotV1 = {
  rankInPool: number;
  tier: VisualRankingShadowTier;
  baselineCandidateUserId: string;
  shadowCandidateUserId: string;
  wouldChange: boolean;
  baselineScore: number;
  shadowScore: number;
  reason: VisualRankingShadowSlotReason;
  reasonTags: string[];
};

/** P7.5-r5-b: dry-run apply eligibility persisted on shadow rows; never implies real apply. */
export type VisualRankingShadowApplyDryRunV1 = {
  evaluated: true;
  eligible: boolean;
  reason: string;
  applySourceVersion: string;
  appliedToPool: false;
};

export type VisualRankingShadowSummaryV1 = {
  changedSlots: number;
  changedTiers: VisualRankingShadowTier[];
  candidatesWithVision: number;
  candidatesMissingVision: number;
  viewerVisionAvailable: boolean;
  applyToPoolIgnored?: boolean;
  applyDryRun?: VisualRankingShadowApplyDryRunV1;
};

export type VisualRankingShadowV1 = {
  schemaVersion: typeof VISUAL_RANKING_SHADOW_SCHEMA_VERSION;
  sourceVersion: typeof VISUAL_RANKING_SHADOW_SOURCE_VERSION;
  generatedAt: string;
  viewerUserId: string;
  poolId: string;
  baselineSourceVersion: typeof VISUAL_RANKING_SHADOW_BASELINE_SOURCE_VERSION;
  shadowSourceVersion: typeof VISUAL_RANKING_SHADOW_HYPOTHETICAL_SOURCE_VERSION;
  appliedToPool: false;
  slots: VisualRankingShadowSlotV1[];
  summary: VisualRankingShadowSummaryV1;
};
