import { authHeaders, baseUrl, handleJson } from "./auth";

export type P2OverviewMineStats = {
  myFeedbackCount: number;
  mySuggestionCount: number;
  myPendingSuggestionCount: number;
  myBehaviorSignalCount: number;
  myConversationSummaryCount: number;
};

export type P2OverviewStats = {
  totalSummaries: number;
  totalFeedbacks: number;
  totalSuggestions: number;
  pendingSuggestions: number;
  totalBehaviorSignals: number;
};

export async function getP2OverviewMine() {
  const res = await fetch(`${baseUrl}/analytics/p2-overview/mine`, {
    headers: authHeaders(),
  });
  return handleJson<P2OverviewMineStats>(res);
}

export async function getP2OverviewGlobal() {
  const res = await fetch(`${baseUrl}/analytics/p2-overview`, {
    headers: authHeaders(),
  });
  return handleJson<P2OverviewStats>(res);
}
