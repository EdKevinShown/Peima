/**
 * P2: allowed `subjectKind` for structured feedback (aligns with types/p2-feedback).
 */

export const P2_FEEDBACK_SUBJECT_KINDS = [
  "match",
  "conversation",
  "suggestion",
  "copilot",
  "other",
] as const;

export type P2FeedbackSubjectKindId =
  (typeof P2_FEEDBACK_SUBJECT_KINDS)[number];
