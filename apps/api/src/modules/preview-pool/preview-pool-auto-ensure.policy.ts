/** Lazy-create preview pool when none exists (P7.10-r11 read path + on-demand ensure). */

function isTruthy(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isPreviewPoolAutoEnsureDisabled(): boolean {
  return isTruthy(process.env.PEIMA_PREVIEW_POOL_AUTO_ENSURE_DISABLED);
}

/** Default on unless explicitly disabled. */
export function isPreviewPoolAutoEnsureEnabled(): boolean {
  if (isPreviewPoolAutoEnsureDisabled()) {
    return false;
  }
  const raw = process.env.PEIMA_PREVIEW_POOL_AUTO_ENSURE_ENABLED?.trim();
  if (raw === undefined || raw === "") {
    return true;
  }
  return isTruthy(raw);
}

/** Fill to 6 with local synthetic candidates when DB has fewer eligible users. */
export function isPreviewPoolAutoEnsureSyntheticFallbackEnabled(): boolean {
  if (isTruthy(process.env.PEIMA_PREVIEW_POOL_AUTO_ENSURE_SYNTHETIC_DISABLED)) {
    return false;
  }
  const raw = process.env.PEIMA_PREVIEW_POOL_AUTO_ENSURE_SYNTHETIC_FALLBACK?.trim();
  if (raw === undefined || raw === "") {
    return true;
  }
  return isTruthy(raw);
}
