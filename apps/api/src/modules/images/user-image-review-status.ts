/**
 * P7.4-r1d-b: resolve reviewStatus from machine detection (pure functions).
 */

import type {
  UserImageDetectionScoreJson,
  UserImageDetectionStatus,
} from "./user-image-quality-detection";

export const USER_IMAGE_REVIEW_STATUS = {
  NOT_REQUIRED: "not_required",
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  NEEDS_REUPLOAD: "needs_reupload",
  APPEALED: "appealed",
  APPEAL_APPROVED: "appeal_approved",
  APPEAL_REJECTED: "appeal_rejected",
} as const;

export type UserImageReviewStatus =
  (typeof USER_IMAGE_REVIEW_STATUS)[keyof typeof USER_IMAGE_REVIEW_STATUS];

export const USER_IMAGE_REVIEW_REASON_CODE = {
  DETECTION_SKIPPED_REVIEW: "DETECTION_SKIPPED_REVIEW",
  MULTIPLE_FACES_REVIEW: "MULTIPLE_FACES_REVIEW",
  USER_APPEAL: "USER_APPEAL",
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE",
  LOW_QUALITY: "LOW_QUALITY",
  FACE_NOT_CLEAR: "FACE_NOT_CLEAR",
  SUSPECTED_NON_PERSON: "SUSPECTED_NON_PERSON",
  INAPPROPRIATE_CONTENT: "INAPPROPRIATE_CONTENT",
} as const;

export type UserImageReviewReasonCode =
  (typeof USER_IMAGE_REVIEW_REASON_CODE)[keyof typeof USER_IMAGE_REVIEW_REASON_CODE];

export type ResolveUserImageReviewStateInput = {
  detectionStatus: UserImageDetectionStatus | string;
  detectionReasonCodes?: string[];
  detectionScoreJson?: UserImageDetectionScoreJson | null;
};

export type ResolvedUserImageReviewState = {
  reviewStatus: UserImageReviewStatus;
  reviewReasonCodes: string[];
};

export function resolveUserImageReviewStateFromDetection(
  input: ResolveUserImageReviewStateInput,
): ResolvedUserImageReviewState {
  const status = String(input.detectionStatus ?? "");

  if (status === "skipped") {
    return {
      reviewStatus: USER_IMAGE_REVIEW_STATUS.PENDING_REVIEW,
      reviewReasonCodes: [
        USER_IMAGE_REVIEW_REASON_CODE.DETECTION_SKIPPED_REVIEW,
      ],
    };
  }

  return {
    reviewStatus: USER_IMAGE_REVIEW_STATUS.NOT_REQUIRED,
    reviewReasonCodes: [],
  };
}
