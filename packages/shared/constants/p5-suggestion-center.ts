/**
 * P5 suggestion center — aligns with `profile_update_suggestions.priority` / `.category`.
 */

export const P5_SUGGESTION_PRIORITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type P5SuggestionPriorityId =
  (typeof P5_SUGGESTION_PRIORITY)[keyof typeof P5_SUGGESTION_PRIORITY];

export const P5_SUGGESTION_CATEGORY = {
  PROFILE_REFINEMENT: "profile_refinement",
  BEHAVIORAL_INSIGHT: "behavioral_insight",
  COMMUNICATION_STYLE: "communication_style",
} as const;

export type P5SuggestionCategoryId =
  (typeof P5_SUGGESTION_CATEGORY)[keyof typeof P5_SUGGESTION_CATEGORY];

/** Sort / weight hints for analytics or UI (higher = more urgent). */
export const PRIORITY_WEIGHT: Record<P5SuggestionPriorityId, number> = {
  [P5_SUGGESTION_PRIORITY.LOW]: 1,
  [P5_SUGGESTION_PRIORITY.MEDIUM]: 2,
  [P5_SUGGESTION_PRIORITY.HIGH]: 3,
};

export const CATEGORY_LABELS: Record<P5SuggestionCategoryId, string> = {
  [P5_SUGGESTION_CATEGORY.PROFILE_REFINEMENT]: "画像细化",
  [P5_SUGGESTION_CATEGORY.BEHAVIORAL_INSIGHT]: "行为洞察",
  [P5_SUGGESTION_CATEGORY.COMMUNICATION_STYLE]: "沟通风格",
};
