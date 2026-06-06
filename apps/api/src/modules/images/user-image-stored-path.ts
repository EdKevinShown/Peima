import { join } from "node:path";

/** Extract on-disk filename from persisted `UserImage.imageUrl`. */
export function storedFilenameFromImageUrl(
  imageUrl: string | null | undefined,
): string | null {
  const raw = String(imageUrl ?? "").trim();
  if (!raw) return null;
  const marker = "/uploads/user-images/";
  const idx = raw.lastIndexOf(marker);
  if (idx >= 0) {
    const name = raw.slice(idx + marker.length).split(/[?#]/)[0]?.trim();
    return name || null;
  }
  if (!raw.includes("://") && !raw.startsWith("/")) {
    return raw.split(/[?#]/)[0]?.trim() || null;
  }
  return null;
}

export function resolveUserImageDiskPath(
  imageUrl: string | null | undefined,
  uploadDir: string,
): string | null {
  const filename = storedFilenameFromImageUrl(imageUrl);
  if (!filename) return null;
  return join(uploadDir, filename);
}

export function buildUserImageContentPath(imageId: string): string {
  return `/images/${encodeURIComponent(imageId)}/content`;
}
