export type M5RrmTop2DisplayEnv = {
  enabled: boolean;
};

/** Truthy values for `PEIMA_M5_RRM_TOP2_ENABLED` (trim + lowercase). */
const M5_RRM_TOP2_ENABLED_TRUTHY = new Set(["1", "true", "yes"]);

function parseM5RrmTop2EnabledFlag(raw: string | undefined): boolean {
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  return M5_RRM_TOP2_ENABLED_TRUTHY.has(v);
}

/**
 * M5.3-C2 / C2.1: gate for resolver RRM Top2 display branch (`PEIMA_M5_RRM_TOP2_ENABLED`).
 * Accepts `1` | `true` | `yes` (case-insensitive, trimmed). Everything else, including unset, is off.
 */
export function readM5RrmTop2DisplayEnv(): M5RrmTop2DisplayEnv {
  return {
    enabled: parseM5RrmTop2EnabledFlag(process.env.PEIMA_M5_RRM_TOP2_ENABLED),
  };
}
