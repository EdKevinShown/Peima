import { authHeaders, baseUrl, handleJson } from "./auth";

export type UserImageRow = {
  id: string;
  userId: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
  detectionStatus?: string;
  detectionReasonCodes?: string[];
  detectionScoreJson?: Record<string, unknown> | null;
  detectionRulesVersion?: string | null;
  detectedAt?: string | null;
  reviewStatus?: string;
  reviewReasonCodes?: string[];
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
};

export async function listUserImages(userId: string) {
  const res = await fetch(
    `${baseUrl}/images/user/${encodeURIComponent(userId)}`,
    { headers: authHeaders() },
  );
  return handleJson<UserImageRow[]>(res);
}

export async function createUserImage(payload: { userId: string; imageUrl: string }) {
  const res = await fetch(`${baseUrl}/images`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  return handleJson<UserImageRow>(res);
}

/** Multipart upload; saves on API disk and returns row with public imageUrl. */
export async function uploadUserImageFile(userId: string, file: File) {
  const form = new FormData();
  form.append("userId", userId);
  form.append("file", file);
  const res = await fetch(`${baseUrl}/images/upload`, {
    method: "POST",
    headers: {
      ...authHeaders(),
    },
    body: form,
  });
  return handleJson<UserImageRow>(res);
}

export async function deleteUserImage(imageId: string) {
  const res = await fetch(`${baseUrl}/images/${encodeURIComponent(imageId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (res.status === 204) return;
  await handleJson<unknown>(res);
}
