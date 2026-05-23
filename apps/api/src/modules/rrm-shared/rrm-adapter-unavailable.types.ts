/**
 * Shared unavailable / degradation reasons for RRM Signal Adapters (M5.1).
 * Module-specific codes may extend via `details` on the summary base type.
 */
export const RRM_ADAPTER_UNAVAILABLE_REASONS = [
  "insufficient_data",
  "message_count_below_threshold",
  "no_advancement_event",
  "not_full_payload",
  "fallback",
  "module_not_implemented",
  "unsupported_source_version",
] as const;

export type RrmAdapterUnavailableReason = (typeof RRM_ADAPTER_UNAVAILABLE_REASONS)[number];
