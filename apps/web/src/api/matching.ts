import { authHeaders, baseUrl, handleJson } from "./auth";

export type MatchingStatus =
  | "not_queued"
  | "waiting"
  | "processing"
  | "ready";

export type MatchingStatusResponse = {
  status: MatchingStatus;
};

/** P1-1 optional JSON on MatchResult; keys are API contract. */
export type MatchInsights = {
  explanation: {
    whyMatch: string;
    strengths: string[];
    cautions: string[];
    rhythmPrediction: string;
  };
  riskFlags: string[];
  openingTopics: string[];
  chatSimulationSummary: string;
};

export type MatchingResultResponse = {
  id: string;
  userId: string;
  candidateUserId: string;
  batchId: string;
  finalScore: number | null;
  reasonSummary: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  matchInsights?: MatchInsights | null;
};

export async function enqueueMatching(userId: string) {
  const res = await fetch(`${baseUrl}/matching/enqueue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ userId }),
  });
  return handleJson<unknown>(res);
}

export async function getMatchingStatus(userId: string) {
  const url = `${baseUrl}/matching/status/${encodeURIComponent(userId)}`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleJson<MatchingStatusResponse>(res);
}

export async function getMatchingResult(userId: string) {
  const url = `${baseUrl}/matching/result/${encodeURIComponent(userId)}`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleJson<MatchingResultResponse>(res);
}
