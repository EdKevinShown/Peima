export const RRM_EVAL_AGGREGATE_SCHEMA_VERSION = 1 as const;

export const RRM_EVAL_DEFAULT_LIMIT = 100 as const;
export const RRM_EVAL_MAX_LIMIT = 500 as const;

export const RRM_EVAL_DEFAULT_SINCE_DAYS = 30 as const;
export const RRM_EVAL_MAX_SINCE_DAYS = 180 as const;

/** Hours without messages after an active thread → cold dropoff proxy. */
export const RRM_EVAL_COLD_DROPOFF_HOURS = 72 as const;

export const RRM_EVAL_MIN_MESSAGES_FOR_COLD_PROXY = 6 as const;

export const RRM_EVAL_COLD_RISK_THRESHOLD = 0.55 as const;
