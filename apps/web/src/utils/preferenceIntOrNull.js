/**
 * Normalize match-preference bounded integer fields before PUT JSON.
 * - Empty / omitted → null（JSON 里必须显式带上字段才可清空服务端旧值；此处把 undefined 也表示为 null）。
 * - 不接受 0、NaN、"null"、非法数字字符串。
 *
 * @param {unknown} value
 * @returns {number | null}
 */
export function preferenceIntOrNull(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "") return null;
    if (t.toLowerCase() === "null") return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n === 0) return null;
    return n;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}
