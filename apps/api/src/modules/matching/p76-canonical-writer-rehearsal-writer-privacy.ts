/**
 * P7.10-r6f1 — privacy guard for rehearsal sidecar shadow payloads.
 */

import type { P76CanonicalWriterShadowPayloadV1 } from "./p76-canonical-writer-shadow.types";
import { P76CanonicalWriterRehearsalWriterError } from "./p76-canonical-writer-rehearsal-writer.types";

export const P76_REHEARSAL_WRITER_MAX_SHADOW_PAYLOAD_BYTES = 32 * 1024;

/** r6a audit JSON + allowlist writer deny list + r6f extensions. */
export const P76_REHEARSAL_WRITER_FORBIDDEN_JSON_KEYS = [
  "rawPrompt",
  "raw_prompt",
  "imageFeatures",
  "image_features",
  "transcript",
  "vendorRawResponse",
  "vendor_raw_response",
  "apiKey",
  "api_key",
  "base64",
  "fullPrompt",
  "full_prompt",
  "rawImage",
  "raw_image",
  "imageUrl",
  "image_url",
  "detectionScoreJson",
  "detection_score_json",
] as const;

export function assertP76CanonicalWriterRehearsalPrivacySafe(
  value: unknown,
  path = "",
): void {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertP76CanonicalWriterRehearsalPrivacySafe(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const full = path ? `${path}.${key}` : key;
    if (
      P76_REHEARSAL_WRITER_FORBIDDEN_JSON_KEYS.some(
        (deny) => deny.toLowerCase() === key.toLowerCase(),
      )
    ) {
      throw new P76CanonicalWriterRehearsalWriterError(
        `privacy violation: forbidden key ${full}`,
      );
    }
    assertP76CanonicalWriterRehearsalPrivacySafe(child, full);
  }
}

export function assertP76CanonicalWriterRehearsalShadowPayloadSizeSafe(
  shadow: P76CanonicalWriterShadowPayloadV1,
): void {
  const bytes = Buffer.byteLength(JSON.stringify(shadow), "utf8");
  if (bytes > P76_REHEARSAL_WRITER_MAX_SHADOW_PAYLOAD_BYTES) {
    throw new P76CanonicalWriterRehearsalWriterError(
      `shadowPayload exceeds ${P76_REHEARSAL_WRITER_MAX_SHADOW_PAYLOAD_BYTES} bytes (${bytes})`,
    );
  }
}

export function assertP76CanonicalWriterRehearsalShadowPrivacyBundle(
  shadow: P76CanonicalWriterShadowPayloadV1,
): void {
  assertP76CanonicalWriterRehearsalPrivacySafe(shadow);
  assertP76CanonicalWriterRehearsalShadowPayloadSizeSafe(shadow);
}
