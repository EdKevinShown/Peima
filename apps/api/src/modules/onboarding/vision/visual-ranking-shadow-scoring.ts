/**
 * P7.5-r3: pure shadow scores (jaccard × confidence); no pool mutation.
 */

import {
  computePreferenceScore,
  computeStyleScore,
  type ViewerPreferenceLike,
} from "@peima/shared/matching/preference-score";
import type { UsableCandidateVision } from "./visual-ranking-shadow-vision-input";
import type { VisualRankingShadowSlotReason } from "./visual-ranking-shadow.types";

export type ShadowCandidateInput = {
  userId: string;
  createdAt: Date;
  styleTags: string[];
  vision: UsableCandidateVision | null;
  preferenceFields: {
    age: number | null;
    city: string;
    height: number | null;
    education: string;
    occupation: string;
    relationshipGoal: string;
  };
};

function normTag(t: string): string {
  return String(t ?? "").trim();
}

/** Jaccard similarity on normalized tag sets. */
export function tagJaccard(tagsA: string[], tagsB: string[]): number {
  const a = new Set(tagsA.map(normTag).filter(Boolean));
  const b = new Set(tagsB.map(normTag).filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter++;
  }
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

export function overlapTags(tagsA: string[], tagsB: string[]): string[] {
  const b = new Set(tagsB.map(normTag).filter(Boolean));
  return [...new Set(tagsA.map(normTag).filter(Boolean))].filter((t) =>
    b.has(t),
  );
}

export function scoreAestheticFitShadow(
  viewerStyleTags: string[],
  candidate: ShadowCandidateInput,
  viewerPref: ViewerPreferenceLike,
): { score: number; reason: VisualRankingShadowSlotReason; reasonTags: string[] } {
  if (candidate.vision && viewerStyleTags.length > 0) {
    const j = tagJaccard(viewerStyleTags, candidate.vision.photoVisualTags);
    const score = j * candidate.vision.confidence;
    return {
      score,
      reason: "aesthetic_tag_overlap",
      reasonTags: overlapTags(viewerStyleTags, candidate.vision.photoVisualTags),
    };
  }
  const baseline = computeStyleScore(viewerPref, {
    styleTags: candidate.styleTags,
  }).score;
  return {
    score: baseline,
    reason: "vision_fallback_baseline",
    reasonTags: overlapTags(viewerStyleTags, candidate.styleTags),
  };
}

export function scoreStyleSimilarShadow(
  viewerPhotoVisualTags: string[] | null,
  viewerVisionAvailable: boolean,
  candidate: ShadowCandidateInput,
  viewerPref: ViewerPreferenceLike,
): { score: number; reason: VisualRankingShadowSlotReason; reasonTags: string[] } {
  if (
    viewerVisionAvailable &&
    viewerPhotoVisualTags &&
    viewerPhotoVisualTags.length > 0 &&
    candidate.vision
  ) {
    const j = tagJaccard(viewerPhotoVisualTags, candidate.vision.photoVisualTags);
    const score = j * candidate.vision.confidence;
    return {
      score,
      reason: "style_tag_similarity",
      reasonTags: overlapTags(
        viewerPhotoVisualTags,
        candidate.vision.photoVisualTags,
      ),
    };
  }
  const baseline = computePreferenceScore(viewerPref, candidate.preferenceFields);
  return {
    score: baseline,
    reason: "vision_fallback_baseline",
    reasonTags: [],
  };
}

export function scoreReflowShadow(
  candidate: ShadowCandidateInput,
): { score: number; reason: VisualRankingShadowSlotReason; reasonTags: string[] } {
  const exploreBase = 0.4;
  const visionBoost =
    candidate.vision && candidate.vision.photoVisualTags.length > 0
      ? tagJaccard(candidate.vision.photoVisualTags, candidate.vision.photoVisualTags) *
        candidate.vision.confidence *
        0.001
      : 0;
  return {
    score: exploreBase + visionBoost,
    reason: "reflow_explore_baseline",
    reasonTags: candidate.vision?.photoVisualTags.slice(0, 2) ?? [],
  };
}

export function pickTopByScore(
  pool: ShadowCandidateInput[],
  exclude: Set<string>,
  scoreFn: (c: ShadowCandidateInput) => {
    score: number;
    reason: VisualRankingShadowSlotReason;
    reasonTags: string[];
  },
  take: number,
): Array<{
  candidate: ShadowCandidateInput;
  score: number;
  reason: VisualRankingShadowSlotReason;
  reasonTags: string[];
}> {
  const available = pool.filter((c) => !exclude.has(c.userId));
  const scored = available.map((c) => {
    const r = scoreFn(c);
    return { candidate: c, ...r };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.candidate.createdAt.getTime() - b.candidate.createdAt.getTime();
  });
  return scored.slice(0, take);
}

export function pickReflowShadow(
  pool: ShadowCandidateInput[],
  exclude: Set<string>,
): {
  candidate: ShadowCandidateInput;
  score: number;
  reason: VisualRankingShadowSlotReason;
  reasonTags: string[];
} | null {
  const available = pool.filter((c) => !exclude.has(c.userId));
  if (available.length === 0) return null;
  const scored = available.map((c) => {
    const r = scoreReflowShadow(c);
    return { candidate: c, ...r };
  });
  scored.sort((a, b) => {
    const ta = a.candidate.createdAt.getTime();
    const tb = b.candidate.createdAt.getTime();
    if (ta !== tb) return ta - tb;
    return b.score - a.score;
  });
  return scored[0] ?? null;
}
