/**
 * P7.6-r4b: profile score for 20D shadow (logic aligned with worker matching-score.ts).
 * Duplicated here to avoid importing worker processor paths from apps/api.
 * TODO(P7.6+): move to @peima/shared with worker re-export.
 */

const PROFILE_DIMS = [
  "attachmentStyle",
  "emotionalExpression",
  "communicationStyle",
  "conflictHandling",
  "loveLanguage",
  "securityNeed",
  "controlNeed",
  "independence",
  "loyaltyView",
  "jealousyTendency",
  "moneyAttitude",
  "careerPriority",
  "lifePace",
  "socialNeed",
  "emotionalStability",
  "sexualValues",
  "familyView",
  "marriageExpectation",
  "childrenIntent",
  "riskPreference",
] as const;

export type P76UserProfileLike = {
  attachmentStyle: number | null;
  emotionalExpression: number | null;
  communicationStyle: number | null;
  conflictHandling: number | null;
  loveLanguage: number | null;
  securityNeed: number | null;
  controlNeed: number | null;
  independence: number | null;
  loyaltyView: number | null;
  jealousyTendency: number | null;
  moneyAttitude: number | null;
  careerPriority: number | null;
  lifePace: number | null;
  socialNeed: number | null;
  emotionalStability: number | null;
  sexualValues: number | null;
  familyView: number | null;
  marriageExpectation: number | null;
  childrenIntent: number | null;
  riskPreference: number | null;
};

/** Prisma UserProfile row → score input (numeric G1-R dims only). */
export function toP76UserProfileLike(
  row: Record<string, unknown> | null | undefined,
): P76UserProfileLike | null {
  if (!row) return null;
  const out: Partial<P76UserProfileLike> = {};
  for (const d of PROFILE_DIMS) {
    const v = row[d];
    out[d] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return out as P76UserProfileLike;
}

export function hasMeaningfulP76Profile(
  profile: P76UserProfileLike | null,
): boolean {
  if (!profile) return false;
  for (const d of PROFILE_DIMS) {
    const v = profile[d];
    if (v != null && Number.isFinite(v)) return true;
  }
  return false;
}

/** Same semantics as `computeProfileScore` in apps/worker/src/jobs/matching-score.ts */
export function computeProfileScoreP76(
  viewer: P76UserProfileLike,
  candidate: P76UserProfileLike,
): number {
  if (!candidate || !viewer) return 0.5;

  let sum = 0;
  let n = 0;
  for (const d of PROFILE_DIMS) {
    const a = viewer[d];
    const b = candidate[d];
    if (a != null && b != null) {
      sum += 1 - Math.abs(a - b);
      n++;
    }
  }
  if (n === 0) return 0.5;
  return sum / n;
}

export const P76_PROFILE_DIMS = PROFILE_DIMS;
export const P76_PROFILE_DIM_KEYS_FOR_SELECT = PROFILE_DIMS as unknown as string[];

/** Keys that must not appear in audit stdout payloads. */
export const P76_SENSITIVE_PROFILE_JSON_KEYS = new Set([
  "dimensionBranchChatHints",
  "effectiveProfileChatOverlayV1",
  "confidence",
]);
