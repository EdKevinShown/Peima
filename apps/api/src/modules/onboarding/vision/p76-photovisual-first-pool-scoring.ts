/**
 * P7.6-r3a: PhotoVisual First Pool shadow scoring (pure; reuses tagJaccard).
 */

import { overlapTags, tagJaccard } from "./visual-ranking-shadow-scoring";
import type { PhotoVisualScoredPairV1 } from "./p76-photovisual-first-pool.types";

const VISUAL_IMBALANCE_PENALTY_R3A = 0;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function computeAtoBPhotoVisualFit(
  viewerStyleTags: string[],
  candidatePhotoVisualTags: string[],
): number {
  return clamp01(tagJaccard(viewerStyleTags, candidatePhotoVisualTags));
}

export function computeBtoAPhotoVisualFit(
  candidateStyleTags: string[],
  viewerPhotoVisualTags: string[],
): number {
  return clamp01(tagJaccard(candidateStyleTags, viewerPhotoVisualTags));
}

export function computeMutualPhotoVisualFit(
  aToB: number,
  bToA: number,
): number {
  const mutual =
    0.5 * clamp01(aToB) +
    0.5 * clamp01(bToA) -
    VISUAL_IMBALANCE_PENALTY_R3A;
  return clamp01(mutual);
}

/** Optional conservative mutual (not used by default builder). */
export function harmonicMeanMutualPhotoVisualFit(
  aToB: number,
  bToA: number,
): number {
  const a = clamp01(aToB);
  const b = clamp01(bToA);
  if (a <= 0 || b <= 0) return 0;
  return clamp01((2 * a * b) / (a + b));
}

export function sortPhotoVisualPairs(
  pairs: PhotoVisualScoredPairV1[],
): PhotoVisualScoredPairV1[] {
  return [...pairs].sort((left, right) => {
    if (right.mutualPhotoVisualFit !== left.mutualPhotoVisualFit) {
      return right.mutualPhotoVisualFit - left.mutualPhotoVisualFit;
    }
    if (right.AtoBPhotoVisualFit !== left.AtoBPhotoVisualFit) {
      return right.AtoBPhotoVisualFit - left.AtoBPhotoVisualFit;
    }
    return left.candidateUserId.localeCompare(right.candidateUserId);
  });
}

export { overlapTags };
