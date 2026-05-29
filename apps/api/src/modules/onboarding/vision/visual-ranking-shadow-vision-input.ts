/**
 * P7.5-r3: extract usable vision from UserImage rows (no external calls).
 */

import { isUserImagePassingForOnboarding } from "../onboarding-photo-passing";
import type { OnboardingVisionProfileV1 } from "./onboarding-vision.types";

export type UsableCandidateVision = {
  photoVisualTags: string[];
  confidence: number;
};

export type UserImageVisionSourceRow = {
  id: string;
  userId: string;
  createdAt: Date;
  detectionScoreJson: unknown;
  detectionStatus: string;
  reviewStatus: string;
};

export const BLOCKING_REVIEW_FOR_VISION = new Set([
  "rejected",
  "needs_reupload",
  "appealed",
  "appeal_rejected",
]);

function normTag(t: string): string {
  return String(t ?? "").trim();
}

function isVisionProfileOk(
  vision: unknown,
): vision is OnboardingVisionProfileV1 {
  if (!vision || typeof vision !== "object") return false;
  const v = vision as OnboardingVisionProfileV1;
  return v.visionStatus === "ok" && Array.isArray(v.photoVisualTags);
}

export function extractUsableVisionFromDetectionScoreJson(
  detectionScoreJson: unknown,
  reviewStatus: string,
): UsableCandidateVision | null {
  if (BLOCKING_REVIEW_FOR_VISION.has((reviewStatus || "").trim())) {
    return null;
  }
  if (
    detectionScoreJson == null ||
    typeof detectionScoreJson !== "object" ||
    Array.isArray(detectionScoreJson)
  ) {
    return null;
  }
  const vision = (detectionScoreJson as Record<string, unknown>).vision;
  if (!isVisionProfileOk(vision)) {
    return null;
  }
  const tags = vision.photoVisualTags
    .map(normTag)
    .filter(Boolean);
  if (tags.length === 0) {
    return null;
  }
  const confidence =
    typeof vision.confidence === "number" && Number.isFinite(vision.confidence)
      ? vision.confidence
      : 0.35;
  return { photoVisualTags: tags, confidence };
}

/** Latest passing image with visionStatus=ok for viewer style_similar. */
export function pickViewerPassingPhotoVision(
  images: UserImageVisionSourceRow[],
): UsableCandidateVision | null {
  const passing = images
    .filter((img) =>
      isUserImagePassingForOnboarding({
        detectionStatus: img.detectionStatus,
        reviewStatus: img.reviewStatus,
      }),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  for (const img of passing) {
    const vision = extractUsableVisionFromDetectionScoreJson(
      img.detectionScoreJson,
      img.reviewStatus,
    );
    if (vision) {
      return vision;
    }
  }
  return null;
}

/** First image per user (asc createdAt) with usable vision. */
export function firstUsableVisionByUserId(
  images: UserImageVisionSourceRow[],
): Map<string, UsableCandidateVision> {
  const ordered = [...images].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const out = new Map<string, UsableCandidateVision>();
  for (const img of ordered) {
    if (out.has(img.userId)) continue;
    const vision = extractUsableVisionFromDetectionScoreJson(
      img.detectionScoreJson,
      img.reviewStatus,
    );
    if (vision) {
      out.set(img.userId, vision);
    }
  }
  return out;
}
