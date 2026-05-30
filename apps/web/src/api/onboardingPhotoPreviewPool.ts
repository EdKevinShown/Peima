import { authHeaders, baseUrl, handleJson } from "./auth";
import type { LatestPreviewPoolResponse } from "./previewPool";

export async function generateOnboardingPhotoPreviewPool() {
  const res = await fetch(`${baseUrl}/onboarding/photo-preview-pool/generate`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleJson<LatestPreviewPoolResponse>(res);
}

export async function getLatestOnboardingPhotoPreviewPool() {
  const res = await fetch(`${baseUrl}/onboarding/photo-preview-pool/me/latest`, {
    headers: authHeaders(),
  });
  return handleJson<LatestPreviewPoolResponse>(res);
}

export async function acknowledgeOnboardingPhotoPreviewPool() {
  const res = await fetch(`${baseUrl}/onboarding/photo-preview-pool/acknowledge`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleJson<{ acknowledgedAt: string }>(res);
}
