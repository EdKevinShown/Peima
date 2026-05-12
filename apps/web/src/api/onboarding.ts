import { authHeaders, baseUrl, handleJson } from "./auth";

export type OnboardingPhotoNextStep =
  | "photo_upload"
  | "photo_preference"
  | "photo_preview"
  | "questionnaire";

export type OnboardingPhotoStatus = {
  hasPhoto: boolean;
  hasPhotoPreference: boolean;
  nextStep: OnboardingPhotoNextStep;
};

export type OnboardingPhotoPreviewItem = {
  id: string;
  candidateUserId: string;
  tier: string;
  displayMode: string;
  rankInPool: number;
  score: number | null;
  reasonTags: string[];
  imageUrl?: string | null;
};

export type OnboardingPhotoPreviewPoolResponse = {
  pool: {
    id: string;
    userId: string;
    status: string;
    sourceVersion: string;
    createdAt: string;
    updatedAt: string;
  };
  items: OnboardingPhotoPreviewItem[];
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

export async function postOnboardingPhotoPreviewPoolGenerate(): Promise<OnboardingPhotoPreviewPoolResponse> {
  const res = await fetch(`${baseUrl}/onboarding/photo-preview-pool/generate`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  return handleJson<OnboardingPhotoPreviewPoolResponse>(res);
}

export async function getOnboardingPhotoPreviewPoolLatest(): Promise<OnboardingPhotoPreviewPoolResponse> {
  const res = await fetch(`${baseUrl}/onboarding/photo-preview-pool/me/latest`, {
    headers: { ...authHeaders() },
  });
  return handleJson<OnboardingPhotoPreviewPoolResponse>(res);
}

export async function postOnboardingPhotoPreviewPoolAcknowledge(): Promise<{ ok: true }> {
  const res = await fetch(`${baseUrl}/onboarding/photo-preview-pool/acknowledge`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  return handleJson<{ ok: true }>(res);
}
