/** P7.4-r1d: reviewStatus values stored on UserImage.reviewStatus */
export const USER_IMAGE_REVIEW_STATUSES = [
  "not_required",
  "pending_review",
  "approved",
  "rejected",
  "needs_reupload",
  "appealed",
  "appeal_approved",
  "appeal_rejected",
] as const;

export type UserImageReviewStatusValue =
  (typeof USER_IMAGE_REVIEW_STATUSES)[number];

export const USER_IMAGE_DETECTION_STATUSES = [
  "pending",
  "passed",
  "failed",
  "skipped",
] as const;

export type UserImageDetectionStatusValue =
  (typeof USER_IMAGE_DETECTION_STATUSES)[number];

/** Admin POST actions may overwrite review from these statuses. */
export const PHOTO_REVIEW_ACTION_SOURCE_STATUSES = [
  "pending_review",
  "not_required",
  "approved",
  "rejected",
  "needs_reupload",
] as const;

export type PhotoReviewActionSourceStatus =
  (typeof PHOTO_REVIEW_ACTION_SOURCE_STATUSES)[number];

/** Writable reviewReasonCodes on admin approve/reject/needs-reupload. */
export const PHOTO_REVIEW_ADMIN_REASON_CODES = [
  "MANUAL_APPROVED",
  "MANUAL_REJECTED",
  "NEEDS_REUPLOAD",
  "FACE_NOT_CLEAR",
  "MULTIPLE_FACES_REVIEW",
  "SUSPECTED_NON_PERSON",
  "INAPPROPRIATE_CONTENT",
  "LOW_QUALITY",
  "USER_REQUESTED_REVIEW",
  "MANUAL_OVERRIDE",
] as const;

export type PhotoReviewAdminReasonCode =
  (typeof PHOTO_REVIEW_ADMIN_REASON_CODES)[number];
