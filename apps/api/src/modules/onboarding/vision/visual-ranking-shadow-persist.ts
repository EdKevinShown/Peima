/**
 * P7.5-r3: pool metadata persistence guard (no migration in r3).
 */

import type { VisualRankingShadowV1 } from "./visual-ranking-shadow.types";

export type VisualRankingShadowPersistResult =
  | { persisted: true }
  | { persisted: false; reason: "shadow_disabled" | "no_metadata_field" };

/**
 * `OnboardingPhotoPreviewPool` has no `metadataJson` column in Prisma schema (P7.5-r3).
 * Returns graceful skip until a JSON metadata field exists.
 */
export function canPersistVisualRankingShadowToPool(): boolean {
  return false;
}

export async function persistVisualRankingShadowIfSupported(
  _poolId: string,
  _shadow: VisualRankingShadowV1,
): Promise<VisualRankingShadowPersistResult> {
  if (!canPersistVisualRankingShadowToPool()) {
    return { persisted: false, reason: "no_metadata_field" };
  }
  return { persisted: true };
}
