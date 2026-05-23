/** Shared with M4.4-M1 CLI and P7.11-r1 Admin API (same aggregation contract). */
export const MATCHING_OBSERVABILITY_SOURCE_VERSION =
  "m4.4-m1-admin-observability-summary-v1" as const;

export const MATCHING_OBSERVABILITY_SCHEMA_VERSION = 1;

export const MATCHING_OBSERVABILITY_DEFAULT_LIMIT = 500;
export const MATCHING_OBSERVABILITY_DEFAULT_SINCE_DAYS = 30;

export const MATCHING_OBSERVABILITY_MAX_LIMIT = 50_000;
export const MATCHING_OBSERVABILITY_MAX_SINCE_DAYS = 3650;

export function clampMatchingObservabilityLimit(raw: number): number {
  if (!Number.isFinite(raw)) return MATCHING_OBSERVABILITY_DEFAULT_LIMIT;
  return Math.max(1, Math.min(MATCHING_OBSERVABILITY_MAX_LIMIT, Math.trunc(raw)));
}

export function clampMatchingObservabilitySinceDays(raw: number): number {
  if (!Number.isFinite(raw)) return MATCHING_OBSERVABILITY_DEFAULT_SINCE_DAYS;
  return Math.max(1, Math.min(MATCHING_OBSERVABILITY_MAX_SINCE_DAYS, Math.trunc(raw)));
}

/** UTC midnight anchor `sinceDays` days before today. */
export function sinceDateUtcForMatchingObservability(sinceDays: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - sinceDays);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
