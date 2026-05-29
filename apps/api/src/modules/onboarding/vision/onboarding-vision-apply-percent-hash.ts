/**
 * P7.5-r5-b: stable 0–99 bucket for percent rollout (no Math.random, no deps).
 */

/**
 * FNV-1a 32-bit hash → unsigned → mod 100. Same viewerUserId always maps to the same bucket.
 */
export function getStablePercentBucket(viewerUserId: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < viewerUserId.length; i++) {
    h ^= viewerUserId.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  const u = h >>> 0;
  return u % 100;
}
