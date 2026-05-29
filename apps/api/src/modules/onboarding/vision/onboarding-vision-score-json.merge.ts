/**
 * P7.5-r2: merge OnboardingVisionProfileV1 into detectionScoreJson (pure).
 */

import type { OnboardingVisionProfileV1 } from "./onboarding-vision.types";

export function detectionScoreJsonBase(
  detectionScoreJson: unknown,
): Record<string, unknown> {
  if (
    detectionScoreJson != null &&
    typeof detectionScoreJson === "object" &&
    !Array.isArray(detectionScoreJson)
  ) {
    return { ...(detectionScoreJson as Record<string, unknown>) };
  }
  return {};
}

/**
 * Preserves quality / face / warnings / pipeline; sets or replaces `vision` only.
 */
export function mergeVisionIntoDetectionScoreJson(
  detectionScoreJson: unknown,
  vision: OnboardingVisionProfileV1,
): Record<string, unknown> {
  const base = detectionScoreJsonBase(detectionScoreJson);
  return {
    ...base,
    vision,
  };
}

/** True when persisted JSON includes a vision block. */
export function detectionScoreJsonHasVision(
  detectionScoreJson: unknown,
): boolean {
  const base = detectionScoreJsonBase(detectionScoreJson);
  return base.vision != null && typeof base.vision === "object";
}
