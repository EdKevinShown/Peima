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

/** Parse image id from `/images/:id/content` path or full API URL. */
export function parseUserImageContentId(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const match = trimmed.match(/\/images\/([^/?#]+)\/content/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export function buildUserImageContentUrl(imageId: string): string {
  const id = String(imageId ?? "").trim();
  if (!id) return "";
  return `${baseUrl.replace(/\/$/, "")}/images/${encodeURIComponent(id)}/content`;
}

/**
 * Fetch protected image bytes with JWT; caller must revoke returned blob URL.
 */
export async function fetchUserImageContentBlobUrl(imageId: string): Promise<string> {
  const id = String(imageId ?? "").trim();
  if (!id) throw new Error("imageId required");
  const res = await fetch(buildUserImageContentUrl(id), {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`image content ${res.status}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Normalize stored image references for display.
 * Legacy `/uploads/user-images/*` URLs are no longer publicly served — use image `id` with AuthenticatedUserImage.
 */
export function resolveUserImageUrl(raw: string, imageId?: string): string {
  const id = imageId || parseUserImageContentId(raw);
  if (id) return buildUserImageContentUrl(id);
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("/uploads/user-images/")) {
    return "";
  }

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
