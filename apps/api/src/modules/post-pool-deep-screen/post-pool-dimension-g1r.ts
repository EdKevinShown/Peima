import type { UserProfile } from "@peima/database";
import { G1R_PROFILE_KEYS } from "../questionnaire/questionnaire.scorer";

/**
 * G1-R scalar profile similarity (same construction as worker `computeProfileScore` /
 * `matching-score.ts` PROFILE_DIMS loop).
 */
export function computeG1rProfileScalarScore(
  viewer: UserProfile | null | undefined,
  candidate: UserProfile | null | undefined,
): number {
  if (!viewer || !candidate) return 0.5;

  let sum = 0;
  let n = 0;
  for (const key of G1R_PROFILE_KEYS) {
    const a = viewer[key as keyof UserProfile];
    const b = candidate[key as keyof UserProfile];
    if (typeof a === "number" && typeof b === "number") {
      sum += 1 - Math.abs(a - b);
      n += 1;
    }
  }
  if (n === 0) return 0.5;
  return sum / n;
}
