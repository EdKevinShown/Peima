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

/**
 * Normalize stored image URLs for cross-device local dev.
 * If backend persisted localhost/127.0.0.1 but web runs on another host,
 * rewrite to the configured API base host so browser can reach the file.
 */
export function resolveUserImageUrl(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  try {
    const api = new URL(baseUrl);
    const image = trimmed.startsWith("/")
      ? new URL(trimmed, api)
      : new URL(trimmed, window.location.origin);

    const imageHost = image.hostname.toLowerCase();
    const pageHost = window.location.hostname.toLowerCase();
    const imageIsLoopback =
      imageHost === "localhost" || imageHost === "127.0.0.1";
    const pageIsLoopback = pageHost === "localhost" || pageHost === "127.0.0.1";
    if (imageIsLoopback && !pageIsLoopback) {
      image.protocol = api.protocol;
      image.host = api.host;
    } else if (
      trimmed.startsWith("/") &&
      (imageHost === pageHost || imageHost === "localhost" || imageHost === "127.0.0.1")
    ) {
      image.protocol = api.protocol;
      image.host = api.host;
    }
    return image.toString();
  } catch {
    return trimmed;
  }
}

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
