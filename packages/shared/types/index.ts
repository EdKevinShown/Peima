/** Cross-app shared types — extend as the domain grows. */

export type Empty = Record<string, never>;

export type {
  MatchInsights,
  MatchInsightsRrmDecisionShadow,
  MatchInsightsRrmDecisionShadowBlockReason,
  MatchInsightsRrmV2Top2SelectorShadow,
  MatchInsightsScoreShadowV2,
} from "./match-p1";
export { MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION } from "./match-p1";

export type {
  P2SourceMetadata,
  P2ChatSummarySnapshot,
} from "./p2-chat-summary";
export type {
  P2FeedbackSubjectKind,
  P2UserFeedback,
} from "./p2-feedback";
export type { P2ProfileUpdateSuggestion } from "./p2-profile-suggestion";
export type { P2BehaviorSignal } from "./p2-signal";
export type {
  P5SuggestionCenterItem,
  P5SuggestionCenterQueryFilter,
  P5SuggestionCenterStats,
  P5SuggestionCenterListResponse,
  P5PermissionContext,
  P5AuditLog,
} from "./p5-operations";