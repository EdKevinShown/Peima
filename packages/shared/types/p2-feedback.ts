import type { P2FeedbackSubjectKindId } from "../constants/p2-feedback-subject-kind";
import type { P2SourceTypeId } from "../constants/p2-source-type";

/** Subject domain for structured feedback. */
export type P2FeedbackSubjectKind = P2FeedbackSubjectKindId;

export type P2UserFeedback = {
  userId: string;
  subjectKind: P2FeedbackSubjectKind;
  /** Id of the subject (match result, conversation, suggestion row, etc.). */
  subjectId: string;
  sourceType: P2SourceTypeId;
  sourceVersion: string;
  /** Optional coarse rating or label bucket. */
  rating?: number;
  tags?: string[];
  comment?: string;
  /** Client or collector timestamp (ISO 8601). */
  recordedAt: string;
};
