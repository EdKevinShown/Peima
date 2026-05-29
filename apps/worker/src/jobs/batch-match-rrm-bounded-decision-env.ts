/**
 * M6.3-r3: gate `matchInsights.rrmBoundedDecision` dry-run meta (audit only).
 * Only the literal `"1"` enables; `"true"` / `"TRUE"` / `"0"` / unset → off.
 */
export function readM6RrmBoundedDecisionDryRunEnv(): { enabled: boolean } {
  return { enabled: process.env.PEIMA_M6_RRM_BOUNDED_DECISION_DRY_RUN_ENABLED === "1" };
}
