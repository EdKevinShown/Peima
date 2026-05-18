/**
 * P7.6-r3a: PhotoVisual pair eligibility (pure; no Prisma).
 */

import type {
  PhotoVisualIneligibleReason,
  PhotoVisualPairEligibilityInput,
  PhotoVisualPairEligibilityResult,
  UsableVisionInput,
} from "./p76-photovisual-first-pool.types";

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = String(raw ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function normalizedPhotoVisualTags(vision: UsableVisionInput | null): string[] {
  if (!vision) return [];
  return normalizeTags(vision.photoVisualTags);
}

function isVisionOk(vision: UsableVisionInput | null): boolean {
  if (!vision) return false;
  return String(vision.visionStatus ?? "").trim() === "ok";
}

export function buildIneligibleReasons(
  input: PhotoVisualPairEligibilityInput,
): PhotoVisualIneligibleReason[] {
  const reasons: PhotoVisualIneligibleReason[] = [];
  const viewerStyle = normalizeTags(input.viewerStyleTags);
  const candidateStyle = normalizeTags(input.candidateStyleTags);
  const viewerPhotoVisual = normalizedPhotoVisualTags(input.viewerVision);
  const candidatePhotoVisual = normalizedPhotoVisualTags(input.candidateVision);

  if (input.gates.isSelf || input.viewerUserId === input.candidateUserId) {
    reasons.push("SELF");
  }
  if (!input.gates.genderGatePassed) {
    reasons.push("GENDER_GATE");
  }
  if (!input.gates.preferenceGatePassed) {
    reasons.push("PREFERENCE_GATE");
  }
  if (input.gates.userBlocked) {
    reasons.push("USER_BLOCKED");
  }
  if (input.gates.missingProfile) {
    reasons.push("MISSING_PROFILE");
  }
  if (!input.gates.reviewUsable) {
    reasons.push("REVIEW_BLOCKED");
  }
  if (!input.gates.detectionUsable) {
    reasons.push("DETECTION_UNAVAILABLE");
  }
  if (!input.viewerVision || viewerPhotoVisual.length === 0) {
    reasons.push("VIEWER_VISION_MISSING");
  }
  if (!input.candidateVision || !isVisionOk(input.candidateVision)) {
    reasons.push("VISION_NOT_OK");
  } else if (candidatePhotoVisual.length === 0) {
    reasons.push("EMPTY_PHOTO_VISUAL_TAGS");
  }
  if (viewerStyle.length === 0 && candidateStyle.length === 0) {
    reasons.push("MISSING_STYLE_TAGS");
  }

  return reasons;
}

export function evaluatePhotoVisualPairEligibility(
  input: PhotoVisualPairEligibilityInput,
): PhotoVisualPairEligibilityResult {
  const ineligibleReasons = buildIneligibleReasons(input);
  return {
    eligible: ineligibleReasons.length === 0,
    ineligibleReasons,
  };
}
