/**
 * P7.10-r3f1 — privacy guard for canonical match result sidecar writer payloads.
 */

import type { P76CanonicalWriterDryRunPayloadV1 } from "./p76-canonical-writer-dry-run.types";
import { P76CanonicalMatchResultSidecarWriterError } from "./p76-canonical-match-result-sidecar-writer.types";

export const P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_FORBIDDEN_JSON_KEYS = [
  "rawPrompt",
  "raw_prompt",
  "fullPrompt",
  "full_prompt",
  "transcript",
  "imageFeatures",
  "image_features",
  "rawImage",
  "raw_image",
  "rawVisionResponse",
  "raw_vision_response",
  "DATABASE_URL",
  "database_url",
  "secrets",
] as const;

export function findP76CanonicalMatchResultSidecarForbiddenKey(
  value: unknown,
  path = "",
): string | null {
  if (value == null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findP76CanonicalMatchResultSidecarForbiddenKey(
        value[i],
        `${path}[${i}]`,
      );
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const full = path ? `${path}.${key}` : key;
    if (
      P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_FORBIDDEN_JSON_KEYS.some(
        (deny) => deny.toLowerCase() === key.toLowerCase(),
      )
    ) {
      return full;
    }
    const nested = findP76CanonicalMatchResultSidecarForbiddenKey(child, full);
    if (nested) return nested;
  }
  return null;
}

export function assertP76CanonicalMatchResultSidecarPayloadPrivacySafe(
  payload: P76CanonicalWriterDryRunPayloadV1,
): void {
  const hit = findP76CanonicalMatchResultSidecarForbiddenKey(payload);
  if (hit) {
    throw new P76CanonicalMatchResultSidecarWriterError(
      `forbidden payload key: ${hit}`,
    );
  }
}
