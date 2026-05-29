/**
 * M6.1-r3: gate `matchInsights.rrmDecisionShadow` generation (shadow-only; no effect on winner).
 */
export function readM6RrmDecisionShadowEnv(): { enabled: boolean } {
  return { enabled: process.env.PEIMA_M6_RRM_DECISION_SHADOW_ENABLED === "1" };
}
