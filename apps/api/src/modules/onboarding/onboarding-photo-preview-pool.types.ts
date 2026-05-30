/** Viewer-safe bundle aligned with `LatestPreviewPoolResponse` on the web client. */

export type OnboardingPhotoPreviewPoolItemDto = {
  id: string;
  previewPoolId: string;
  userId: string;
  candidateUserId: string;
  /** tier: aesthetic_fit | style_similar | reflow */
  candidateType: string;
  displayMode: string;
  rankInPool: number;
  baseScore: number | null;
  itemMeta?: {
    slotReason?: string;
    shortHint?: string;
    tags?: string[];
    candidateImageUrl?: string;
    reasonTags?: string[];
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type OnboardingPhotoPreviewPoolBundle = {
  previewPool: {
    id: string;
    userId: string;
    status: string;
    sourceVersion: string;
    createdAt: string;
    updatedAt: string;
  };
  items: OnboardingPhotoPreviewPoolItemDto[];
};
