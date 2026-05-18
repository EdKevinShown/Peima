/**
 * P7.6-r4a: 20D bidirectional shadow scoring (pure; normalized scores only).
 */

import type {
  TwentyDCandidateRankedResultV1,
  TwentyDDirectionalFitInputV1,
} from "./p76-20d-bidirectional-ranking.types";

/** Locked in r4a (see P7.6-r4 design §4.2). */
export const TWENTY_D_WEIGHT_PROFILE = 0.4;
export const TWENTY_D_WEIGHT_PREFERENCE = 0.6;

export function clampTwentyDScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function isValidUnitScore(n: number | null): n is number {
  return n !== null && Number.isFinite(n);
}

/**
 * Combines profile + preference for one direction.
 * Profile is required; missing preference is treated as 0 with PREFERENCE_MISSING at builder layer.
 */
export function computeDirectional20DFit(
  input: TwentyDDirectionalFitInputV1,
): number | null {
  if (!isValidUnitScore(input.profileScore)) {
    return null;
  }
  const profile = clampTwentyDScore(input.profileScore);
  const preference = isValidUnitScore(input.preferenceScore)
    ? clampTwentyDScore(input.preferenceScore)
    : 0;
  const combined =
    TWENTY_D_WEIGHT_PROFILE * profile +
    TWENTY_D_WEIGHT_PREFERENCE * preference;
  return clampTwentyDScore(combined);
}

export function computeAtoB20DFit(input: {
  profileScoreAtoB: number | null;
  preferenceScoreAtoB: number | null;
}): number | null {
  return computeDirectional20DFit({
    profileScore: input.profileScoreAtoB,
    preferenceScore: input.preferenceScoreAtoB,
  });
}

export function computeBtoA20DFit(input: {
  profileScoreBtoA: number | null;
  preferenceScoreBtoA: number | null;
}): number | null {
  return computeDirectional20DFit({
    profileScore: input.profileScoreBtoA,
    preferenceScore: input.preferenceScoreBtoA,
  });
}

export function harmonicMean20DFit(aToB: number, bToA: number): number {
  const a = clampTwentyDScore(aToB);
  const b = clampTwentyDScore(bToA);
  if (a <= 0 || b <= 0) return 0;
  return clampTwentyDScore((2 * a * b) / (a + b));
}

/** Default mutual = harmonic mean (r4 design §4.3). */
export function computeMutual20DFit(aToB: number, bToA: number): number {
  return harmonicMean20DFit(aToB, bToA);
}

export function computeImbalancePenaltyRecord(
  aToB: number,
  bToA: number,
): number {
  return Math.abs(clampTwentyDScore(aToB) - clampTwentyDScore(bToA));
}

export function sortTwentyDRankedCandidates(
  results: TwentyDCandidateRankedResultV1[],
): TwentyDCandidateRankedResultV1[] {
  return [...results].sort((left, right) => {
    if (right.mutual20DFit !== left.mutual20DFit) {
      return right.mutual20DFit - left.mutual20DFit;
    }
    if (right.AtoB20DFit !== left.AtoB20DFit) {
      return right.AtoB20DFit - left.AtoB20DFit;
    }
    if (right.BtoA20DFit !== left.BtoA20DFit) {
      return right.BtoA20DFit - left.BtoA20DFit;
    }
    return left.candidateUserId.localeCompare(right.candidateUserId);
  });
}
