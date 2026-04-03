import { authHeaders } from "./auth";

const baseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

async function handleJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("未登录或 token 无效，请先登录（/login）");
    }
    let detail = text;
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(body.message)) {
        detail = body.message.join(", ");
      } else if (body.message) {
        detail = String(body.message);
      }
    } catch {
      /* use raw text */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

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
