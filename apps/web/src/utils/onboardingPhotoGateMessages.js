/**
 * P7.4-r1d-e3: onboarding photo review gate copy (pure functions).
 * Does not expose reviewNote or admin-only fields.
 */

/** @typedef {import('../api/onboarding').OnboardingPhotoStatus} OnboardingPhotoStatus */

export const PHOTO_GATE_MESSAGES = {
  photo_rejected:
    "这张照片暂时无法用于匹配，请上传一张更清晰的本人照片。",
  photo_needs_reupload:
    "请重新上传一张清晰的本人照片，以继续完成匹配流程。",
  photo_appealed:
    "这张照片正在复核中，请先上传一张新的清晰本人照片。",
  photo_appeal_rejected:
    "这张照片复核未通过，请上传一张新的清晰本人照片。",
};

export const PHOTO_UNDER_REVIEW_MESSAGE =
  "照片正在审核中，你可以先继续完成资料。";

export const PARTIAL_BLOCKED_PHOTO_HINT =
  "部分照片未通过审核，但你已有可用照片，可以继续。";

const REVIEW_REASON_LABELS = {
  NEEDS_REUPLOAD: "需要重新上传",
  FACE_NOT_CLEAR: "人脸不够清晰",
  MULTIPLE_FACES_REVIEW: "建议单人照片",
  SUSPECTED_NON_PERSON: "照片内容不符合要求",
  INAPPROPRIATE_CONTENT: "照片内容不符合要求",
  LOW_QUALITY: "照片质量不足",
  MANUAL_REJECTED: "未通过审核",
  USER_REQUESTED_REVIEW: "需人工复核",
  MANUAL_OVERRIDE: "需调整照片",
};

/**
 * @param {string} code
 * @returns {string | null}
 */
export function mapReviewReasonCodeToHint(code) {
  if (!code || typeof code !== "string") return null;
  return REVIEW_REASON_LABELS[code] ?? null;
}

/**
 * Blocking message when user cannot proceed (no passing photo).
 * @param {OnboardingPhotoStatus | null | undefined} status
 * @returns {string | null}
 */
export function getPhotoGateMessage(status) {
  if (!status?.photoGateMessageKey) return null;
  const key = status.photoGateMessageKey;
  return PHOTO_GATE_MESSAGES[key] ?? null;
}

/**
 * Non-blocking pending review hint.
 * @param {OnboardingPhotoStatus | null | undefined} status
 * @returns {string | null}
 */
export function getPhotoUnderReviewMessage(status) {
  if (status?.hasPhotoUnderReview && status?.hasPassingPhoto) {
    return PHOTO_UNDER_REVIEW_MESSAGE;
  }
  return null;
}

/**
 * User has passing photo but also blocked images.
 * @param {OnboardingPhotoStatus | null | undefined} status
 * @returns {string | null}
 */
export function getPartialBlockedPhotoHint(status) {
  if (status?.hasBlockedPhoto && status?.hasPassingPhoto) {
    return PARTIAL_BLOCKED_PHOTO_HINT;
  }
  return null;
}

/**
 * @param {OnboardingPhotoStatus | null | undefined} status
 * @returns {boolean}
 */
export function shouldShowBlockedPhotoGate(status) {
  return status?.hasBlockedPhoto === true && status?.hasPassingPhoto !== true;
}

/**
 * Optional secondary line from review reason codes (no raw codes if unmapped).
 * @param {OnboardingPhotoStatus | null | undefined} status
 * @returns {string | null}
 */
export function getPhotoGateReasonHints(status) {
  const codes = status?.photoGateReasonCodes;
  if (!Array.isArray(codes) || codes.length === 0) return null;
  const hints = codes
    .map((c) => mapReviewReasonCodeToHint(c))
    .filter(Boolean);
  if (hints.length === 0) return null;
  return hints.join("；");
}

/**
 * Combined blocked gate copy for upload page banner.
 * @param {OnboardingPhotoStatus | null | undefined} status
 * @returns {{ main: string, detail: string | null } | null}
 */
export function getBlockedPhotoReviewBanner(status) {
  if (!shouldShowBlockedPhotoGate(status)) return null;
  const main = getPhotoGateMessage(status);
  if (!main) return null;
  return {
    main,
    detail: getPhotoGateReasonHints(status),
  };
}
