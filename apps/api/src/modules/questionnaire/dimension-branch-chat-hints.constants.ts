/** P6.8 accepted suggestion: fixed attribution (do not change without migration note). */
export const P6_8_PROFILE_COMPLETION_SOURCE_VERSION =
  "p6.8-profile-completion-ai-v1" as const;

/** P6.8 chat POST `profile-completion-suggestion` — fixed `sourceVersion` on created rows. */
export const P6_8_PROFILE_COMPLETION_CHAT_GENERATE_SOURCE_VERSION =
  "p6.8-profile-completion-chat-ai-v1" as const;

/** Envelope in `ProfileUpdateSuggestion.proposedPatch` and persisted `UserProfile.dimensionBranchChatHints`. */
export const P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND =
  "g1r_dimension_branch_hints_v1" as const;

export function isP6DimensionBranchHintsSourceVersion(
  v: string | null | undefined,
): boolean {
  return (
    v === P6_8_PROFILE_COMPLETION_SOURCE_VERSION ||
    v === P6_8_PROFILE_COMPLETION_CHAT_GENERATE_SOURCE_VERSION
  );
}
