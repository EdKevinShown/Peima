import type { AdminPhotoReviewDetectionSummary } from "../admin-photo-review-detection-summary";

export type AdminPhotoReviewListItemDto = {
  imageId: string;
  userId: string;
  imageUrl: string;
  detectionStatus: string;
  detectionReasonCodes: string[];
  detectionRulesVersion: string | null;
  detectedAt: Date | null;
  reviewStatus: string;
  reviewReasonCodes: string[];
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  detectionSummary: AdminPhotoReviewDetectionSummary | null;
};

export type AdminPhotoReviewUserSummaryDto = {
  userId: string;
  nickname: string;
};

export type AdminPhotoReviewDetailDto = AdminPhotoReviewListItemDto & {
  detectionScoreJson: unknown;
  user: AdminPhotoReviewUserSummaryDto;
};

export type AdminPhotoReviewListResponseDto = {
  items: AdminPhotoReviewListItemDto[];
  nextCursor: string | null;
};
