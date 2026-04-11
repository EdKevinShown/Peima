/** Shared constants */

export const APP_NAME = "peima" as const;

export {
  P1_DISCLAIMER,
  P1_MARK,
  P1_HINT_PREFIX,
} from "./p1-placeholders";

export {
  P2_FEEDBACK_SUBJECT_KINDS,
  type P2FeedbackSubjectKindId,
} from "./p2-feedback-subject-kind";
export {
  P2SourceType,
  type P2SourceTypeId,
} from "./p2-source-type";
export {
  P2SuggestionStatus,
  type P2SuggestionStatusId,
} from "./p2-suggestion-status";
export {
  UserRole,
  Permission,
  ROLE_PERMISSIONS_MAP,
  getPermissionsForRoles,
  hasPermission,
  getRolesFromEnv,
} from "./p5-rbac";

export {
  P5_SUGGESTION_PRIORITY,
  P5_SUGGESTION_CATEGORY,
  PRIORITY_WEIGHT,
  CATEGORY_LABELS,
  type P5SuggestionPriorityId,
  type P5SuggestionCategoryId,
} from "./p5-suggestion-center";
