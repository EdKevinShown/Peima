/**
 * P7.6-r5b: RRM rhythm profile dims + compatibility (read-only audit; no Prisma).
 */

export const P76_RRM_RHYTHM_DIMS = [
  "relationshipPace",
  "initiativeLevel",
  "conflictResponse",
  "emotionalExpression",
  "emotionalStability",
  "communicationStyle",
  "conflictHandling",
  "attachmentStyle",
  "securityNeed",
  "controlNeed",
  "independence",
  "socialNeed",
] as const;

export type P76RrmRhythmProfileLike = {
  relationshipPace: number | null;
  initiativeLevel: number | null;
  conflictResponse: number | null;
  emotionalExpression: number | null;
  emotionalStability: number | null;
  communicationStyle: number | null;
  conflictHandling: number | null;
  attachmentStyle: number | null;
  securityNeed: number | null;
  controlNeed: number | null;
  independence: number | null;
  socialNeed: number | null;
};

export const P76_RRM_RHYTHM_DIM_KEYS_FOR_SELECT = P76_RRM_RHYTHM_DIMS as unknown as string[];

export const P76_SENSITIVE_RRM_PROFILE_JSON_KEYS = new Set([
  "dimensionBranchChatHints",
  "effectiveProfileChatOverlayV1",
  "confidence",
]);

const RHYTHM_MISMATCH_DIMS: (keyof P76RrmRhythmProfileLike)[] = [
  "relationshipPace",
  "initiativeLevel",
];

const PRESSURE_MISMATCH_DIMS: (keyof P76RrmRhythmProfileLike)[] = [
  "securityNeed",
  "controlNeed",
];

const BOUNDARY_MISMATCH_DIMS: (keyof P76RrmRhythmProfileLike)[] = [
  "independence",
  "conflictHandling",
  "conflictResponse",
  "communicationStyle",
];

const MISMATCH_THRESHOLD = 0.35;
const REPAIR_STABILITY_FLOOR = 0.35;

export function clampRrmRhythmUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Prisma UserProfile row → RRM rhythm subset (numeric only). */
export function toP76RrmRhythmProfileLike(
  row: Record<string, unknown> | null | undefined,
): P76RrmRhythmProfileLike | null {
  if (!row) return null;
  const out: Partial<P76RrmRhythmProfileLike> = {};
  for (const d of P76_RRM_RHYTHM_DIMS) {
    const v = row[d];
    out[d] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return out as P76RrmRhythmProfileLike;
}

export function hasMeaningfulP76RrmProfile(
  profile: P76RrmRhythmProfileLike | null,
): boolean {
  if (!profile) return false;
  for (const d of P76_RRM_RHYTHM_DIMS) {
    const v = profile[d];
    if (v != null && Number.isFinite(v)) return true;
  }
  return false;
}

/** Avg(1 - |a-b|) on overlapping RRM dims; no overlap → null. */
export function computeRhythmCompatibilityP76(
  a: P76RrmRhythmProfileLike,
  b: P76RrmRhythmProfileLike,
): number | null {
  if (!a || !b) return null;

  let sum = 0;
  let n = 0;
  for (const d of P76_RRM_RHYTHM_DIMS) {
    const av = a[d];
    const bv = b[d];
    if (av != null && bv != null) {
      sum += 1 - Math.abs(av - bv);
      n++;
    }
  }
  if (n === 0) return null;
  return clampRrmRhythmUnit(sum / n);
}

function maxAbsDiffOnDims(
  a: P76RrmRhythmProfileLike,
  b: P76RrmRhythmProfileLike,
  dims: (keyof P76RrmRhythmProfileLike)[],
): number {
  let max = 0;
  for (const d of dims) {
    const av = a[d];
    const bv = b[d];
    if (av != null && bv != null) {
      max = Math.max(max, Math.abs(av - bv));
    }
  }
  return max;
}

export function buildP76RrmRiskAndRepairFlags(
  viewer: P76RrmRhythmProfileLike,
  candidate: P76RrmRhythmProfileLike,
): {
  rhythmRiskFlags: string[];
  pressureRiskFlags: string[];
  boundaryRiskFlags: string[];
  repairPotentialSignals: string[];
} {
  const rhythmRiskFlags: string[] = [];
  const pressureRiskFlags: string[] = [];
  const boundaryRiskFlags: string[] = [];
  const repairPotentialSignals: string[] = [];

  if (maxAbsDiffOnDims(viewer, candidate, RHYTHM_MISMATCH_DIMS) > MISMATCH_THRESHOLD) {
    rhythmRiskFlags.push("rhythm_mismatch");
  }
  if (maxAbsDiffOnDims(viewer, candidate, PRESSURE_MISMATCH_DIMS) > MISMATCH_THRESHOLD) {
    pressureRiskFlags.push("pressure_mismatch");
  }
  if (maxAbsDiffOnDims(viewer, candidate, BOUNDARY_MISMATCH_DIMS) > MISMATCH_THRESHOLD) {
    boundaryRiskFlags.push("boundary_mismatch");
  }

  const vStab = viewer.emotionalStability;
  const cStab = candidate.emotionalStability;
  if (
    (vStab != null && vStab < REPAIR_STABILITY_FLOOR) ||
    (cStab != null && cStab < REPAIR_STABILITY_FLOOR)
  ) {
    repairPotentialSignals.push("repair_signal_low");
  } else if (
    vStab != null &&
    cStab != null &&
    vStab >= 0.5 &&
    cStab >= 0.5
  ) {
    repairPotentialSignals.push("repair_potential_ok");
  }

  return {
    rhythmRiskFlags,
    pressureRiskFlags,
    boundaryRiskFlags,
    repairPotentialSignals,
  };
}
