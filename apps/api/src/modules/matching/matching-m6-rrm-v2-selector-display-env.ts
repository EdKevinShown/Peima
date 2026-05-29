/**
 * M6.0-r6: readonly display resolver branch for `matchInsights.rrmV2Top2Selector`.
 * Only `"1"` enables (strict); does not affect worker / finalScore / primary candidate.
 */
export function readM6RrmV2SelectorDisplayEnv(): { enabled: boolean } {
  return { enabled: process.env.PEIMA_M6_RRM_V2_SELECTOR_DISPLAY_ENABLED === "1" };
}
