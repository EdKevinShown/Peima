import { authHeaders, baseUrl, handleJson } from "./auth";

export type OnboardingPhotoNextStep =
  | "photo_upload"
  | "photo_preference"
  | "photo_preview"
  | "questionnaire";

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

export type OnboardingPhotoStatus = {
  hasPhoto: boolean;
  hasPassingPhoto?: boolean;
  hasPhotoPreference: boolean;
  nextStep: OnboardingPhotoNextStep;
  hasPhotoUnderReview?: boolean;
  photoReviewStatusSummary?: PhotoReviewStatusSummary;
  hasBlockedPhoto?: boolean;
  blockingPhotoReviewStatus?: BlockingPhotoReviewStatus | null;
  photoGateMessageKey?: PhotoGateMessageKey | null;
  photoGateReasonCodes?: string[];
  passingPhotoCount?: number;
  blockedPhotoId?: string | null;
  passingPhotoId?: string | null;
};

export async function getOnboardingPhotoStatus(): Promise<OnboardingPhotoStatus> {
  const res = await fetch(`${baseUrl}/onboarding/photo/status`, {
    headers: { ...authHeaders() },
  });
  return handleJson<OnboardingPhotoStatus>(res);
}

export async function postOnboardingPhotoPreferences(styleTags: string[]) {
  const res = await fetch(`${baseUrl}/onboarding/photo-preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ styleTags }),
  });
  return handleJson<{ styleTags: string[] }>(res);
}

export async function getOnboardingPhotoPreferencesMe(): Promise<{
  styleTags: string[];
}> {
  const res = await fetch(`${baseUrl}/onboarding/photo-preferences/me`, {
    headers: { ...authHeaders() },
  });
  return handleJson<{ styleTags: string[] }>(res);
}
