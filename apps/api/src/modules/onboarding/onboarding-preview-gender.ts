/**
 * P7.5-r4-i: onboarding photo preview gender gate (reads `User.gender` only).
 * Viewer must be strictly male/female at generate(); candidates must be opposite binary.
 */

export type PreviewGenderNorm = "male" | "female" | "unknown";

export function isStrictBinaryPreviewGender(
  norm: PreviewGenderNorm,
): norm is "male" | "female" {
  return norm === "male" || norm === "female";
}

/** Normalize app / mapping strings; empty / unrecognized → unknown. */
export function normalizeUserGenderForPreview(
  raw: string | null | undefined,
): PreviewGenderNorm {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s === "male" || s === "m" || s === "男") return "male";
  if (s === "female" || s === "f" || s === "女") return "female";
  return "unknown";
}

/** Convenience for callers that already normalized the viewer string. */
export function resolveOppositeGenderForPreview(
  viewerNormalized: PreviewGenderNorm,
): "male" | "female" | null {
  if (viewerNormalized === "male") return "female";
  if (viewerNormalized === "female") return "male";
  return null;
}

/**
 * Viewer must already be `male` | `female`.
 * Candidate must normalize to the opposite binary; unknown / empty / invalid excluded.
 */
export function candidatePassesOppositeBinaryGate(
  viewerBinary: "male" | "female",
  candidateRaw: string | null | undefined,
): boolean {
  const c = normalizeUserGenderForPreview(candidateRaw);
  if (!isStrictBinaryPreviewGender(c)) return false;
  if (viewerBinary === "male") return c === "female";
  return c === "male";
}

export function genderStorageFromBinary(norm: "male" | "female"): string {
  return norm;
}

/** Prisma `where` clause: candidate gender must be opposite of viewer (binary only). */
export function oppositeBinaryGenderWhere(
  viewerBinary: "male" | "female",
): { OR: Array<{ gender: string }> } {
  const opposite = resolveOppositeGenderForPreview(viewerBinary);
  if (!opposite) {
    return { OR: [{ gender: "__no_opposite__" }] };
  }
  if (opposite === "female") {
    return { OR: [{ gender: "female" }, { gender: "f" }, { gender: "女" }] };
  }
  return { OR: [{ gender: "male" }, { gender: "m" }, { gender: "男" }] };
}
