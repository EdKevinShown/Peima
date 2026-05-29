import { Transform } from "class-transformer";

/** Align with web `preferenceIntOrNull`: omit clears via undefined → no patch; explicit null clears field. */
export function normalizePreferenceBoundedIntInput(
  value: unknown,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    const t = trimmed.toLowerCase();
    if (t === "" || t === "null") return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0) return null;
    return n;
  }

  if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value === 0
    ) {
      return null;
    }
    return value;
  }

  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0) return null;
  return n;
}

/** Reusable @Transform — runs before validators / implicit coercion. */
export function TransformPreferenceBoundedInt() {
  return Transform(({ value }) => normalizePreferenceBoundedIntInput(value));
}
