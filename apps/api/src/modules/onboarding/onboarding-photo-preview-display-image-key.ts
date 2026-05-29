/**
 * P7.5-r4-o2: stable key for "same source image" across demo users who re-import the same file
 * (r4h per-user URL differs; slug segment in filename is shared).
 */

/**
 * Parse `imageUrl` for r4h import markers; otherwise return full URL string (caller may treat as unique).
 * Returns "" only when `imageUrl` is null/blank.
 */
export function extractDisplayImageSourceKeyFromImageUrl(
  imageUrl: string | null | undefined,
): string {
  if (!imageUrl?.trim()) return "";
  let u = imageUrl.trim();
  try {
    u = decodeURIComponent(u);
  } catch {
    /* ignore */
  }
  const perUser = u.match(/-r4h-u[a-zA-Z0-9_-]+--([a-zA-Z0-9_-]+)--/);
  if (perUser?.[1]) return `r4h:${perUser[1]}`;
  const legacy = u.match(/-r4h-import-([a-zA-Z0-9_-]+)/);
  if (legacy?.[1]) {
    const slug = legacy[1].replace(/-+$/g, "");
    return `r4h-import:${slug}`;
  }
  return u;
}

/** Row key for preview pool dedupe: prefer parsed source; else per-candidate fallback (never ""). */
export function previewPoolRowDisplaySourceKey(row: {
  id: string;
  firstImageUrl: string | null;
}): string {
  const k = extractDisplayImageSourceKeyFromImageUrl(row.firstImageUrl);
  return k || `candidate:${row.id}`;
}

/** Extract slug segment after `r4h:` / `r4h-import:` for mapping.json basename lookup. */
export function r4hSlugFromDisplaySourceKey(key: string): string | null {
  if (key.startsWith("r4h-import:")) return key.slice("r4h-import:".length) || null;
  if (key.startsWith("r4h:")) return key.slice("r4h:".length) || null;
  return null;
}
