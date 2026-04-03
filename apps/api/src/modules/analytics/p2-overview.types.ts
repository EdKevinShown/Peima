/** Global P2 table counts (read-only aggregates). */
export type P2OverviewStats = {
  totalSummaries: number;
  totalFeedbacks: number;
  totalSuggestions: number;
  pendingSuggestions: number;
  totalBehaviorSignals: number;
};

/** Per-user P2 counts for the authenticated user. */
export type P2OverviewMineStats = {
  myFeedbackCount: number;
  mySuggestionCount: number;
  myPendingSuggestionCount: number;
  myBehaviorSignalCount: number;
  myConversationSummaryCount: number;
};
