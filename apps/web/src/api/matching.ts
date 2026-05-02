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

/** M3.8-M13: viewer-safe finalize 摘要（无 raw pairwise / dimensions / strongRisk）。 */
export type ViewerSafeFinalMatchDecisionMeta = {
  sourceType: string;
  mode: string;
  pairwiseProposalRecommendation: string;
  selectedCandidateUserId: string;
  staticTop1CandidateUserId: string;
  pairwiseWinnerCandidateUserId: string | null;
  wouldChangeStaticResult: boolean;
  fallbackReason: string | null;
  frozen: boolean;
  frozenAt: string | null;
  appliedToFinalScore: boolean;
  appliedToWorkerRanking: boolean;
};

/**
 * GET `/matching/result/:userId` 的 JSON 形状。
 * M4.3：最终匹配页仅重组展示与折叠策略；不改变本响应字段含义或服务端决策。
 */
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
  /** M3.8-M13：与 `candidateUserId` 可能不同；Final 页应优先用于展示与对端资料。 */
  displayCandidateUserId?: string;
  displaySourceType?:
    | "match_result_original"
    | "static_final"
    | "pairwise_final"
    | "static_fallback";
  finalMatchDecisionMeta?: ViewerSafeFinalMatchDecisionMeta | null;
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

/** M3.8-M11/M12A: finalize sidecar — server never mutates `MatchResult.candidateUserId` / `finalScore`. */
export type FinalizeWithPairwiseApiStatus = "pending" | "finalized" | "already_frozen" | "disabled";

export type FinalizeWithPairwiseResponse = {
  ok: true;
  status: FinalizeWithPairwiseApiStatus;
  /** Opaque server meta; do not log or render raw fields to users. */
  finalMatchDecisionMeta: Record<string, unknown> | null;
};

export async function finalizeWithPairwise(params: { poolId: string; pairwiseJobId: string }) {
  const poolId = params.poolId.trim();
  const pairwiseJobId = params.pairwiseJobId.trim();
  if (!poolId || !pairwiseJobId) {
    throw new Error("缺少 poolId 或 pairwiseJobId。");
  }
  const res = await fetch(`${baseUrl}/matching/finalize-with-pairwise`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ poolId, pairwiseJobId }),
  });
  return handleJson<FinalizeWithPairwiseResponse>(res);
}
