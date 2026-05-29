/**
 * M5.5-M2: gate for persisting `MatchResultRrmTop2DisplayMeta` via controlled writer only.
 * Default off; not read by GET / resolver.
 */
const M5_RRM_TOP2_META_WRITE_TRUTHY = new Set(["1", "true", "yes"]);

function parseM5RrmTop2MetaWriteEnabledFlag(raw: string | undefined): boolean {
  if (raw == null) return false;
  const v = raw.trim().toLowerCase();
  return M5_RRM_TOP2_META_WRITE_TRUTHY.has(v);
}

/**
 * `PEIMA_M5_RRM_TOP2_META_WRITE_ENABLED` — accepts `1` | `true` | `yes` (case-insensitive, trimmed).
 */
export function readM5RrmTop2MetaWriteEnabled(): boolean {
  return parseM5RrmTop2MetaWriteEnabledFlag(process.env.PEIMA_M5_RRM_TOP2_META_WRITE_ENABLED);
}
