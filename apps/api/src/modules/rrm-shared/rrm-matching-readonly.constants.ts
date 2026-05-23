import {
  RRM_SOURCE_VERSION_RANKING_PROPOSAL,
  RRM_SOURCE_VERSION_SIM,
} from "./rrm-source-version.registry";

/**
 * `matchInsights.rrmSimReadonlySummary` / M5.1–M5.3 display sidecar allow-list.
 * Single source — do not duplicate string literals in matching modules.
 */
export const RRM_MATCHING_READONLY_DISPLAY_SOURCE_VERSIONS = [
  RRM_SOURCE_VERSION_SIM,
  RRM_SOURCE_VERSION_RANKING_PROPOSAL,
] as const;

export type RrmMatchingReadonlyDisplaySourceVersion =
  (typeof RRM_MATCHING_READONLY_DISPLAY_SOURCE_VERSIONS)[number];

export const RRM_MATCHING_READONLY_DISPLAY_SOURCE_VERSIONS_SET = new Set<string>(
  RRM_MATCHING_READONLY_DISPLAY_SOURCE_VERSIONS,
);

export function isRrmMatchingReadonlyDisplaySourceVersion(
  value: string,
): value is RrmMatchingReadonlyDisplaySourceVersion {
  return RRM_MATCHING_READONLY_DISPLAY_SOURCE_VERSIONS_SET.has(value);
}
