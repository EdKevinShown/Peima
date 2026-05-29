import type { UserImageDetectionScoreJson } from "../images/user-image-quality-detection";

export type AdminPhotoReviewDetectionSummary = {
  faceCount?: number;
  warnings: string[];
  primaryFace?: UserImageDetectionScoreJson["face"] extends { primaryFace?: infer P }
    ? P
    : unknown;
  quality?: UserImageDetectionScoreJson["quality"];
};

export function buildDetectionSummary(
  scoreJson: unknown,
): AdminPhotoReviewDetectionSummary | null {
  if (!scoreJson || typeof scoreJson !== "object") {
    return null;
  }
  const json = scoreJson as UserImageDetectionScoreJson;
  const warnings = Array.isArray(json.warnings)
    ? json.warnings.filter((w): w is string => typeof w === "string")
    : [];
  return {
    faceCount: json.face?.faceCount,
    warnings,
    primaryFace: json.face?.primaryFace,
    quality: json.quality,
  };
}

export function rowHasWarnings(scoreJson: unknown): boolean {
  const summary = buildDetectionSummary(scoreJson);
  return (summary?.warnings.length ?? 0) > 0;
}
