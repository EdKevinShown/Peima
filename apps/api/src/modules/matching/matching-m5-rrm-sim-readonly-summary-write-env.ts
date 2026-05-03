/**
 * M5.2-M2B: gate for persisting viewer-safe `matchInsights.rrmSimReadonlySummary` only.
 * Parsed at service / write-hook call sites — not inside `matching-rrm-sim-readonly-summary` builders.
 */
export function readM5RrmSimReadonlySummaryWriteEnabled(): boolean {
  const v = process.env.PEIMA_M5_RRM_SIM_READONLY_SUMMARY_WRITE_ENABLED;
  return v === "true" || v === "1" || v === "yes";
}
