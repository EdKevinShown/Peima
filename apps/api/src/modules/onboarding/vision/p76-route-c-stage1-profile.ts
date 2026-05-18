/**
 * P7.6-r7g3: profile helpers for Route C Stage1 adapter (read-only).
 */

import {
  P76_PROFILE_DIMS,
  toP76UserProfileLike,
} from "../../matching/p76-20d-bidirectional-ranking-profile-score";

export { toP76UserProfileLike } from "../../matching/p76-20d-bidirectional-ranking-profile-score";

const ROUTE_C_CORE_20D_KEYS = [
  "relationshipPace",
  "emotionalStability",
  "communicationStyle",
  "conflictHandling",
  "lifePace",
  "socialNeed",
] as const;

const MIN_CORE_20D_FOR_ROUTE_C = 4;

const ROUTE_C_REPORT_20D_KEYS = [
  ...ROUTE_C_CORE_20D_KEYS,
  ...P76_PROFILE_DIMS,
] as const;

function countNonNullKeys(
  row: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): number {
  if (!row) return 0;
  const seen = new Set<string>();
  let n = 0;
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) n += 1;
  }
  return n;
}

/** Aligns with r7g §4 readiness: ≥4 of 6 core dims non-null. */
export function hasMeaningfulRouteCCore20D(
  row: Record<string, unknown> | null | undefined,
): boolean {
  return (
    countNonNullKeys(row, ROUTE_C_CORE_20D_KEYS) >= MIN_CORE_20D_FOR_ROUTE_C
  );
}

/** Report field: non-null count across core + G1-R dims (deduped). */
export function countNonNullP76ProfileDims(
  row: Record<string, unknown> | null | undefined,
): number {
  return countNonNullKeys(row, ROUTE_C_REPORT_20D_KEYS);
}
