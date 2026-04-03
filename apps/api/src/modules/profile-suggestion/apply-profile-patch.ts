import { BadRequestException } from "@nestjs/common";

/** UserProfile dimension keys (questionnaire-derived); confidence included. */
export const PROFILE_PATCH_FLOAT_KEYS = [
  "socialEnergy",
  "emotionalExpression",
  "relationshipPace",
  "initiativeLevel",
  "decisionOrientation",
  "conflictResponse",
  "confidence",
] as const;

export type ProfilePatchFloatKey = (typeof PROFILE_PATCH_FLOAT_KEYS)[number];

export type ProfileFloatPatch = Partial<
  Record<ProfilePatchFloatKey, number>
>;

const KEY_SET = new Set<string>(PROFILE_PATCH_FLOAT_KEYS);

/**
 * Extracts only known UserProfile float fields; clamps to [0, 1].
 * Unknown keys are ignored (allows metadata inside proposedPatch).
 */
export function parseProfileProposedPatch(
  proposedPatch: unknown,
): ProfileFloatPatch {
  if (
    proposedPatch === null ||
    typeof proposedPatch !== "object" ||
    Array.isArray(proposedPatch)
  ) {
    throw new BadRequestException("proposedPatch must be a plain object");
  }

  const out: ProfileFloatPatch = {};
  for (const [rawKey, rawVal] of Object.entries(proposedPatch)) {
    if (!KEY_SET.has(rawKey)) {
      continue;
    }
    const key = rawKey as ProfilePatchFloatKey;
    if (typeof rawVal !== "number" || !Number.isFinite(rawVal)) {
      throw new BadRequestException(
        `proposedPatch.${rawKey} must be a finite number`,
      );
    }
    out[key] = Math.min(1, Math.max(0, rawVal));
  }
  return out;
}
