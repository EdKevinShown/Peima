import { rowHasWarnings } from "./admin-photo-review-detection-summary";
import type { ReviewWritePayload } from "./admin-photo-review-write";

export const PHOTO_REVIEW_AUDIT_ACTION = {
  APPROVE: "PHOTO_REVIEW_APPROVE",
  REJECT: "PHOTO_REVIEW_REJECT",
  NEEDS_REUPLOAD: "PHOTO_REVIEW_NEEDS_REUPLOAD",
} as const;

export type PhotoReviewAuditAction =
  (typeof PHOTO_REVIEW_AUDIT_ACTION)[keyof typeof PHOTO_REVIEW_AUDIT_ACTION];

export const PHOTO_REVIEW_AUDIT_ENTITY_TYPE = "USER_IMAGE" as const;

export type PhotoReviewAuditBeforeRow = {
  id: string;
  userId: string;
  reviewStatus: string;
  reviewReasonCodes: string[];
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  detectionStatus: string;
  detectionReasonCodes: string[];
  detectionRulesVersion: string | null;
  detectionScoreJson: unknown;
};

export type PhotoReviewReviewAuditValues = {
  reviewStatus: string;
  reviewReasonCodes: string[];
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
};

export type PhotoReviewAuditMeta = {
  userId: string;
  detectionStatus: string;
  detectionReasonCodes: string[];
  detectionRulesVersion: string | null;
  hasWarnings: boolean;
  requestReasonCodes: string[];
  notePresent: boolean;
};

export type PhotoReviewAuditNewValues = PhotoReviewReviewAuditValues & {
  meta: PhotoReviewAuditMeta;
};

export function buildPhotoReviewAuditOldValues(
  row: PhotoReviewAuditBeforeRow,
): PhotoReviewReviewAuditValues {
  return snapshotReviewFields(row);
}

export function buildPhotoReviewAuditNewValues(
  row: PhotoReviewAuditBeforeRow,
  write: ReviewWritePayload,
  reviewedAt: Date,
  actorUserId: string,
  requestReasonCodes: string[] | undefined,
): PhotoReviewAuditNewValues {
  return {
    reviewStatus: write.reviewStatus,
    reviewReasonCodes: write.reviewReasonCodes,
    reviewedAt: reviewedAt.toISOString(),
    reviewedByUserId: actorUserId,
    reviewNote: write.reviewNote,
    meta: {
      userId: row.userId,
      detectionStatus: row.detectionStatus,
      detectionReasonCodes: row.detectionReasonCodes,
      detectionRulesVersion: row.detectionRulesVersion,
      hasWarnings: rowHasWarnings(row.detectionScoreJson),
      requestReasonCodes: requestReasonCodes ?? [],
      notePresent:
        write.reviewNote !== null && write.reviewNote !== undefined && write.reviewNote.length > 0,
    },
  };
}

function snapshotReviewFields(row: {
  reviewStatus: string;
  reviewReasonCodes: string[];
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
}): PhotoReviewReviewAuditValues {
  return {
    reviewStatus: row.reviewStatus,
    reviewReasonCodes: [...row.reviewReasonCodes],
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewedByUserId: row.reviewedByUserId,
    reviewNote: row.reviewNote,
  };
}

export const PHOTO_REVIEW_AUDIT_BEFORE_SELECT = {
  id: true,
  userId: true,
  updatedAt: true,
  reviewStatus: true,
  reviewReasonCodes: true,
  reviewedAt: true,
  reviewedByUserId: true,
  reviewNote: true,
  detectionStatus: true,
  detectionReasonCodes: true,
  detectionRulesVersion: true,
  detectionScoreJson: true,
} as const;
