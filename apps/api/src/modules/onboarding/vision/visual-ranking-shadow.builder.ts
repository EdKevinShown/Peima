/**
 * P7.5-r3: build VisualRankingShadowV1 from baseline pool + candidate vision inputs.
 */

import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import type { UsableCandidateVision } from "./visual-ranking-shadow-vision-input";
import {
  pickReflowShadow,
  pickTopByScore,
  scoreAestheticFitShadow,
  scoreStyleSimilarShadow,
  type ShadowCandidateInput,
} from "./visual-ranking-shadow-scoring";
import type {
  VisualRankingShadowSlotV1,
  VisualRankingShadowTier,
  VisualRankingShadowV1,
} from "./visual-ranking-shadow.types";
import {
  VISUAL_RANKING_SHADOW_BASELINE_SOURCE_VERSION,
  VISUAL_RANKING_SHADOW_HYPOTHETICAL_SOURCE_VERSION,
  VISUAL_RANKING_SHADOW_SCHEMA_VERSION,
  VISUAL_RANKING_SHADOW_SOURCE_VERSION,
} from "./visual-ranking-shadow.types";
import type { ViewerPreferenceLike } from "@peima/shared/matching/preference-score";

export type BaselinePoolItemInput = {
  rankInPool: number;
  tier: string;
  displayMode: string;
  candidateUserId: string;
  score: number | null;
};

export type BuildVisualRankingShadowInput = {
  viewerUserId: string;
  poolId: string;
  baselineItems: BaselinePoolItemInput[];
  viewerStyleTags: string[];
  viewerPhotoVisualTags: string[] | null;
  viewerVisionAvailable: boolean;
  candidates: ShadowCandidateInput[];
  viewerPref: ViewerPreferenceLike;
  env: OnboardingVisionEnv;
  /** When true, user set APPLY_TO_POOL gate on but engine still ignores real items (r4–r5-b). */
  applyToPoolIgnoredHint?: boolean;
  generatedAt?: string;
};

function asTier(tier: string): VisualRankingShadowTier {
  if (tier === "style_similar" || tier === "reflow") return tier;
  return "aesthetic_fit";
}

function numScore(v: number | null | undefined, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return fallback;
}

export function buildVisualRankingShadowV1(
  input: BuildVisualRankingShadowInput,
): VisualRankingShadowV1 {
  const {
    viewerUserId,
    poolId,
    baselineItems,
    viewerStyleTags,
    viewerPhotoVisualTags,
    viewerVisionAvailable,
    candidates,
    viewerPref,
    env,
    applyToPoolIgnoredHint = false,
  } = input;

  const baselineByRank = new Map(
    baselineItems.map((it) => [it.rankInPool, it]),
  );

  const used = new Set<string>();
  const shadowPicks: Array<{
    rankInPool: number;
    tier: VisualRankingShadowTier;
    displayMode: string;
    candidateUserId: string;
    score: number;
    reason: VisualRankingShadowSlotV1["reason"];
    reasonTags: string[];
  }> = [];

  const aesthetic = pickTopByScore(
    candidates,
    used,
    (c) => scoreAestheticFitShadow(viewerStyleTags, c, viewerPref),
    3,
  );
  for (let i = 0; i < aesthetic.length; i++) {
    const pick = aesthetic[i]!;
    used.add(pick.candidate.userId);
    shadowPicks.push({
      rankInPool: i + 1,
      tier: "aesthetic_fit",
      displayMode: "clear",
      candidateUserId: pick.candidate.userId,
      score: pick.score,
      reason: pick.reason,
      reasonTags: pick.reasonTags,
    });
  }

  const styleSimilar = pickTopByScore(
    candidates,
    used,
    (c) =>
      scoreStyleSimilarShadow(
        viewerPhotoVisualTags,
        viewerVisionAvailable,
        c,
        viewerPref,
      ),
    2,
  );
  for (let i = 0; i < styleSimilar.length; i++) {
    const pick = styleSimilar[i]!;
    used.add(pick.candidate.userId);
    shadowPicks.push({
      rankInPool: 4 + i,
      tier: "style_similar",
      displayMode: "blurred",
      candidateUserId: pick.candidate.userId,
      score: pick.score,
      reason: pick.reason,
      reasonTags: pick.reasonTags,
    });
  }

  const reflow = pickReflowShadow(candidates, used);
  if (reflow) {
    used.add(reflow.candidate.userId);
    shadowPicks.push({
      rankInPool: 6,
      tier: "reflow",
      displayMode: "hidden",
      candidateUserId: reflow.candidate.userId,
      score: reflow.score,
      reason: reflow.reason,
      reasonTags: reflow.reasonTags,
    });
  }

  const slots: VisualRankingShadowSlotV1[] = shadowPicks.map((shadow) => {
    const baseline = baselineByRank.get(shadow.rankInPool);
    const baselineCandidateUserId = baseline?.candidateUserId ?? shadow.candidateUserId;
    const baselineScore = numScore(baseline?.score, 0);
    return {
      rankInPool: shadow.rankInPool,
      tier: shadow.tier,
      baselineCandidateUserId,
      shadowCandidateUserId: shadow.candidateUserId,
      wouldChange: baselineCandidateUserId !== shadow.candidateUserId,
      baselineScore,
      shadowScore: shadow.score,
      reason: shadow.reason,
      reasonTags: shadow.reasonTags,
    };
  });

  const changedSlots = slots.filter((s) => s.wouldChange).length;
  const changedTiers = [
    ...new Set(
      slots.filter((s) => s.wouldChange).map((s) => s.tier),
    ),
  ] as VisualRankingShadowTier[];

  const candidatesWithVision = candidates.filter((c) => c.vision != null).length;
  const candidatesMissingVision = candidates.length - candidatesWithVision;

  return {
    schemaVersion: VISUAL_RANKING_SHADOW_SCHEMA_VERSION,
    sourceVersion: VISUAL_RANKING_SHADOW_SOURCE_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    viewerUserId,
    poolId,
    baselineSourceVersion: VISUAL_RANKING_SHADOW_BASELINE_SOURCE_VERSION,
    shadowSourceVersion: VISUAL_RANKING_SHADOW_HYPOTHETICAL_SOURCE_VERSION,
    appliedToPool: false,
    slots,
    summary: {
      changedSlots,
      changedTiers,
      candidatesWithVision,
      candidatesMissingVision,
      viewerVisionAvailable,
      ...(applyToPoolIgnoredHint ? { applyToPoolIgnored: true } : {}),
    },
  };
}

export function buildShadowCandidatesFromGatedRows(
  rows: Array<{
    id: string;
    createdAt: Date;
    firstImageStyleTags: string[];
    age: number | null;
    city: string;
    height: number | null;
    education: string;
    occupation: string;
    relationshipGoal: string;
  }>,
  visionByUserId: Map<string, UsableCandidateVision>,
): ShadowCandidateInput[] {
  return rows.map((row) => ({
    userId: row.id,
    createdAt: row.createdAt,
    styleTags: row.firstImageStyleTags,
    vision: visionByUserId.get(row.id) ?? null,
    preferenceFields: {
      age: row.age,
      city: row.city,
      height: row.height,
      education: row.education,
      occupation: row.occupation,
      relationshipGoal: row.relationshipGoal,
    },
  }));
}
