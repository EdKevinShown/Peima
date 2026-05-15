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

/** P7.5-r4-j: `/account` structured profile + preference option lists */
export {
  ACCOUNT_CITY_VALUES,
  ACCOUNT_REGION_OPTIONS,
  ACCOUNT_DISPLAY_GENDER,
  ACCOUNT_EDUCATION_VALUES,
  ACCOUNT_GENDER_VALUES,
  ACCOUNT_MAX_AGE,
  ACCOUNT_MAX_HEIGHT_CM,
  ACCOUNT_MIN_AGE,
  ACCOUNT_MIN_HEIGHT_CM,
  ACCOUNT_OCCUPATION_CATEGORY_VALUES,
  ACCOUNT_RELATIONSHIP_GOAL_VALUES,
  ACCOUNT_STYLE_TAG_WHITELIST,
  ONBOARDING_PHOTO_PREFERENCE_UI_GROUPS,
  ONBOARDING_PHOTO_STYLE_TAG_POOL,
  ONBOARDING_PHOTO_STYLE_TAG_POOL_SET,
  ONBOARDING_STYLE_GROUP_FEEL_TAGS,
  ONBOARDING_STYLE_GROUP_VIBE_TAGS,
  PHOTO_FOCUS_TAG_OPTIONS,
  PHOTO_VISUAL_TAGS,
  ageOptionsInclusive,
  heightOptionsCmInclusive,
  isAllowedStylePreferenceTag,
  type AccountCity,
  type AccountEducation,
  type AccountGender,
  type AccountRegion,
  type AccountStyleTag,
  type OnboardingPhotoPreferenceUiGroup,
} from "./p75-r4-j-account-form";
