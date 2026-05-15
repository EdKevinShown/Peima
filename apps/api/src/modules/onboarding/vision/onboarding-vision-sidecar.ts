/**
 * P7.5-r2: apply vision sidecar to detectionScoreJson (pure, testable).
 */

import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import { readOnboardingVisionEnv } from "./onboarding-vision-env";
import { buildOnboardingVisionProfileForPersist } from "./onboarding-vision-persist";
import { mergeVisionIntoDetectionScoreJson } from "./onboarding-vision-score-json.merge";

/**
 * @returns Updated score JSON, or original when vision disabled.
 *          When enabled, always merges a `vision` block (including skipped/failed).
 */
export function applyVisionSidecarToDetectionScoreJson(
  detectionScoreJson: unknown,
  env: OnboardingVisionEnv = readOnboardingVisionEnv(),
): unknown {
  if (!env.enabled) {
    return detectionScoreJson;
  }

  const profile = buildOnboardingVisionProfileForPersist(
    detectionScoreJson,
    env,
  );
  if (!profile) {
    return detectionScoreJson;
  }

  return mergeVisionIntoDetectionScoreJson(detectionScoreJson, profile);
}
