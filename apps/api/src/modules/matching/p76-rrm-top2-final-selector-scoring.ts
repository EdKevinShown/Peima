/**
 * P7.6-r5a: RRM Top2 shadow scoring (pure; normalized rhythm scores only).
 */

import type {
  RrmCandidateSortRowV1,
  RrmDirectionalRhythmInputV1,
  RrmRepairPotentialSignal,
  RrmRiskFlag,
  RrmTop2CandidateInputV1,
} from "./p76-rrm-top2-final-selector.types";

export function clampRrmScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function isValidUnitScore(n: number | null): n is number {
  return n !== null && Number.isFinite(n);
}

export function computeAtoBRrmFit(
  input: RrmDirectionalRhythmInputV1,
): number | null {
  if (!isValidUnitScore(input.rhythmScore)) return null;
  return clampRrmScore(input.rhythmScore);
}

export function computeBtoARrmFit(
  input: RrmDirectionalRhythmInputV1,
): number | null {
  if (!isValidUnitScore(input.rhythmScore)) return null;
  return clampRrmScore(input.rhythmScore);
}

export function harmonicMeanRrmFit(aToB: number, bToA: number): number {
  const a = clampRrmScore(aToB);
  const b = clampRrmScore(bToA);
  if (a <= 0 || b <= 0) return 0;
  return clampRrmScore((2 * a * b) / (a + b));
}

/** Default mutual = harmonic mean (P7.6-r5 design §5.2). */
export function computeMutualRrmFit(aToB: number, bToA: number): number {
  return harmonicMeanRrmFit(aToB, bToA);
}

export function normalizeRiskFlags(flags: RrmRiskFlag[] | undefined): RrmRiskFlag[] {
  if (!flags?.length) return [];
  const seen = new Set<string>();
  const out: RrmRiskFlag[] = [];
  for (const f of flags) {
    const v = String(f ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function normalizeRepairSignals(
  signals: RrmRepairPotentialSignal[] | undefined,
): RrmRepairPotentialSignal[] {
  if (!signals?.length) return [];
  const seen = new Set<string>();
  const out: RrmRepairPotentialSignal[] = [];
  for (const s of signals) {
    const v = String(s ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Risk flags do not alter raw fit; count is used for sort degradation only. */
export function computeRrmRiskFlagCount(candidate: {
  rhythmRiskFlags?: RrmRiskFlag[];
  pressureRiskFlags?: RrmRiskFlag[];
  boundaryRiskFlags?: RrmRiskFlag[];
}): number {
  return (
    normalizeRiskFlags(candidate.rhythmRiskFlags).length +
    normalizeRiskFlags(candidate.pressureRiskFlags).length +
    normalizeRiskFlags(candidate.boundaryRiskFlags).length
  );
}

/**
 * Penalty record for audit (0 = no flags). Does not subtract from mutualRrmFit in r5a.
 */
export function computeRrmRiskPenalty(flags: {
  rhythmRiskFlags?: RrmRiskFlag[];
  pressureRiskFlags?: RrmRiskFlag[];
  boundaryRiskFlags?: RrmRiskFlag[];
}): number {
  const count = computeRrmRiskFlagCount(flags);
  if (count <= 0) return 0;
  return Math.min(1, count * 0.1);
}

export function computeRepairPotentialScore(
  candidate: Pick<
    RrmTop2CandidateInputV1,
    "repairPotentialSignals" | "repairPotentialScore"
  >,
): number {
  const explicit = candidate.repairPotentialScore;
  if (explicit != null && Number.isFinite(explicit)) {
    return clampRrmScore(explicit);
  }
  const signals = normalizeRepairSignals(candidate.repairPotentialSignals);
  return clampRrmScore(signals.length * 0.2);
}

export function sortRrmTop2Candidates(
  results: RrmCandidateSortRowV1[],
): RrmCandidateSortRowV1[] {
  return [...results].sort((left, right) => {
    if (right.mutualRrmFit !== left.mutualRrmFit) {
      return right.mutualRrmFit - left.mutualRrmFit;
    }
    if (left.riskFlagCount !== right.riskFlagCount) {
      return left.riskFlagCount - right.riskFlagCount;
    }
    if (right.repairPotentialScore !== left.repairPotentialScore) {
      return right.repairPotentialScore - left.repairPotentialScore;
    }
    return left.candidateUserId.localeCompare(right.candidateUserId);
  });
}

export function sortKeysFullyTied(
  a: RrmCandidateSortRowV1,
  b: RrmCandidateSortRowV1,
): boolean {
  return (
    a.mutualRrmFit === b.mutualRrmFit &&
    a.riskFlagCount === b.riskFlagCount &&
    a.repairPotentialScore === b.repairPotentialScore
  );
}
