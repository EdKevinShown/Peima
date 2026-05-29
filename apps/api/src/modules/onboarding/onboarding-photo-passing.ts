/**
 * P7.4-r1d-e2: per-image passing + onboarding photo gate aggregation.
 */

export const USABLE_DETECTION_STATUSES_FOR_ONBOARDING = [
  "passed",
  "skipped",
] as const;

export type BlockingPhotoReviewStatus =
  | "rejected"
  | "needs_reupload"
  | "appealed"
  | "appeal_rejected";

export type PhotoGateMessageKey =
  | "photo_rejected"
  | "photo_needs_reupload"
  | "photo_appealed"
  | "photo_appeal_rejected";

export type PhotoReviewStatusSummary =
  | "none"
  | "pending_review"
  | "blocked_rejected"
  | "blocked_needs_reupload"
  | "blocked_appealed"
  | "blocked_appeal_rejected";

export type OnboardingGateImageRow = {
  id: string;
  detectionStatus: string;
  reviewStatus: string;
  reviewReasonCodes: string[];
  createdAt: Date;
};

export type OnboardingPhotoGateComputed = {
  hasPassingPhoto: boolean;
  hasPhotoUnderReview: boolean;
  hasBlockedPhoto: boolean;
  blockingPhotoReviewStatus: BlockingPhotoReviewStatus | null;
  photoGateMessageKey: PhotoGateMessageKey | null;
  photoGateReasonCodes: string[];
  passingPhotoCount: number;
  blockedPhotoId: string | null;
  passingPhotoId: string | null;
  photoReviewStatusSummary: PhotoReviewStatusSummary;
};

const BLOCKING_REVIEW_STATUSES: readonly BlockingPhotoReviewStatus[] = [
  "rejected",
  "needs_reupload",
  "appealed",
  "appeal_rejected",
];

function isBlockingReviewStatus(
  status: string,
): status is BlockingPhotoReviewStatus {
  return (BLOCKING_REVIEW_STATUSES as readonly string[]).includes(status);
}

function detectionAllowsOnboardingPassing(detectionStatus: string): boolean {
  return (USABLE_DETECTION_STATUSES_FOR_ONBOARDING as readonly string[]).includes(
    detectionStatus,
  );
}

/** Per-image passing for onboarding gate (pure). */
export function isUserImagePassingForOnboarding(
  image: Pick<OnboardingGateImageRow, "detectionStatus" | "reviewStatus">,
): boolean {
  const review = (image.reviewStatus || "not_required").trim() || "not_required";
  const detection = image.detectionStatus;

  switch (review) {
    case "approved":
    case "appeal_approved":
      return true;
    case "rejected":
    case "needs_reupload":
    case "appeal_rejected":
    case "appealed":
      return false;
    case "pending_review":
    case "not_required":
      return detectionAllowsOnboardingPassing(detection);
    default:
      return detectionAllowsOnboardingPassing(detection);
  }
}

function blockingPriority(status: BlockingPhotoReviewStatus): number {
  switch (status) {
    case "needs_reupload":
      return 4;
    case "rejected":
      return 3;
    case "appealed":
      return 2;
    case "appeal_rejected":
      return 1;
  }
}

function toPhotoGateMessageKey(
  status: BlockingPhotoReviewStatus,
): PhotoGateMessageKey {
  switch (status) {
    case "rejected":
      return "photo_rejected";
    case "needs_reupload":
      return "photo_needs_reupload";
    case "appealed":
      return "photo_appealed";
    case "appeal_rejected":
      return "photo_appeal_rejected";
  }
}

function toBlockedSummary(
  status: BlockingPhotoReviewStatus,
): PhotoReviewStatusSummary {
  switch (status) {
    case "rejected":
      return "blocked_rejected";
    case "needs_reupload":
      return "blocked_needs_reupload";
    case "appealed":
      return "blocked_appealed";
    case "appeal_rejected":
      return "blocked_appeal_rejected";
  }
}

function pickPrimaryBlockingImage(
  images: OnboardingGateImageRow[],
): OnboardingGateImageRow | null {
  const blocked = images.filter((img) =>
    isBlockingReviewStatus(img.reviewStatus),
  );
  if (blocked.length === 0) {
    return null;
  }
  return [...blocked].sort((a, b) => {
    const pri = blockingPriority(b.reviewStatus as BlockingPhotoReviewStatus)
      - blockingPriority(a.reviewStatus as BlockingPhotoReviewStatus);
    if (pri !== 0) {
      return pri;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  })[0];
}

function pickLatestPassingImage(
  images: OnboardingGateImageRow[],
): OnboardingGateImageRow | null {
  const passing = images.filter((img) => isUserImagePassingForOnboarding(img));
  if (passing.length === 0) {
    return null;
  }
  return [...passing].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
}

export function computeOnboardingPhotoGateFromImages(
  images: OnboardingGateImageRow[],
): OnboardingPhotoGateComputed {
  const passingImages = images.filter((img) =>
    isUserImagePassingForOnboarding(img),
  );
  const hasPassingPhoto = passingImages.length > 0;
  const hasPhotoUnderReview = images.some(
    (img) => img.reviewStatus === "pending_review",
  );
  const blockedImages = images.filter((img) =>
    isBlockingReviewStatus(img.reviewStatus),
  );
  const hasBlockedPhoto = blockedImages.length > 0;

  const latestPassing = pickLatestPassingImage(images);
  const primaryBlocking = pickPrimaryBlockingImage(images);

  const blockingPhotoReviewStatus = primaryBlocking
    ? (primaryBlocking.reviewStatus as BlockingPhotoReviewStatus)
    : null;

  const photoGateMessageKey =
    !hasPassingPhoto && blockingPhotoReviewStatus
      ? toPhotoGateMessageKey(blockingPhotoReviewStatus)
      : null;

  const photoGateReasonCodes =
    !hasPassingPhoto && primaryBlocking
      ? [...primaryBlocking.reviewReasonCodes]
      : [];

  let photoReviewStatusSummary: PhotoReviewStatusSummary = "none";
  if (hasPhotoUnderReview) {
    photoReviewStatusSummary = "pending_review";
  } else if (!hasPassingPhoto && blockingPhotoReviewStatus) {
    photoReviewStatusSummary = toBlockedSummary(blockingPhotoReviewStatus);
  }

  return {
    hasPassingPhoto,
    hasPhotoUnderReview,
    hasBlockedPhoto,
    blockingPhotoReviewStatus,
    photoGateMessageKey,
    photoGateReasonCodes,
    passingPhotoCount: passingImages.length,
    blockedPhotoId: primaryBlocking?.id ?? null,
    passingPhotoId: latestPassing?.id ?? null,
    photoReviewStatusSummary,
  };
}
