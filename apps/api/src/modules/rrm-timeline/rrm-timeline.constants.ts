export const RRM_TIMELINE_SCHEMA_VERSION = 1 as const;

/** Align with Observed minimum coverage for trend confidence. */
export const RRM_TIMELINE_MIN_MESSAGE_COUNT = 6 as const;
export const RRM_TIMELINE_MIN_MESSAGES_PER_PARTY = 2 as const;

/** Merge advancement anchors within this span (ms). */
export const RRM_TIMELINE_WINDOW_MERGE_MS = 24 * 3600_000;

/** Expand window around anchor message (ms each side). */
export const RRM_TIMELINE_WINDOW_PADDING_MS = 12 * 3600_000;

export const RRM_TIMELINE_MAX_CONTENT_CHARS = 500 as const;
