/**
 * P7.5-r7-b: block sensitive cloud fields from vision sidecar.
 */

export const CLOUD_VISION_SENSITIVE_FIELD_NAMES = [
  "beautyScore",
  "attractivenessScore",
  "genderGuess",
  "ageGuess",
  "ethnicity",
  "faceIdentity",
  "faceEmbedding",
  "celebrityLookalike",
  "aiBeautifySuggestion",
  "aiAvatarSuggestion",
] as const;

const SENSITIVE_LOWER = new Set(
  CLOUD_VISION_SENSITIVE_FIELD_NAMES.map((k) => k.toLowerCase()),
);

export function isCloudVisionSensitiveFieldName(key: string): boolean {
  return SENSITIVE_LOWER.has(String(key ?? "").trim().toLowerCase());
}

/** Deep-strip sensitive keys from arbitrary provider payloads. */
export function stripCloudVisionSensitiveFields<T>(value: T): T {
  if (value == null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripCloudVisionSensitiveFields(item)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isCloudVisionSensitiveFieldName(k)) continue;
    out[k] = stripCloudVisionSensitiveFields(v);
  }
  return out as T;
}
