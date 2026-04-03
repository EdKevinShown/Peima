/**
 * P2: lifecycle for profile (or other) suggestions requiring explicit user action.
 */

export const P2SuggestionStatus = {
  Pending: "pending",
  Accepted: "accepted",
  Dismissed: "dismissed",
} as const;

export type P2SuggestionStatusId =
  (typeof P2SuggestionStatus)[keyof typeof P2SuggestionStatus];
