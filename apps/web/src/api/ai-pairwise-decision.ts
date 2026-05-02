import { authHeaders, baseUrl } from "./auth";

/** Viewer-safe job (M3.8-M5); matches API mapper — no raw dimensions / axis / risks. */
export type ViewerPairwiseShortlistCandidate = {
  candidateUserId: string;
  staticRank: 1 | 2;
  staticCompatibilityScore: number;
  reasonSummary: string;
};

export type ViewerPairwiseDecisionCandidateSlice = {
  candidateUserId: string;
  suggestedAction: string;
  progressionWindow: string;
  reasonSummary: string;
};

export type ViewerPairwiseDecisionSlice = {
  winnerCandidateId: string;
  loserCandidateId: string;
  decisionConfidence: number;
  decisionReason: string;
  candidateA: ViewerPairwiseDecisionCandidateSlice;
  candidateB: ViewerPairwiseDecisionCandidateSlice;
  fallbackUsed: boolean;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
};

export type ViewerPairwiseFailure = {
  code: string;
  message: string;
};

export type ViewerPairwiseJobResponse = {
  id: string;
  viewerUserId: string;
  poolId: string;
  status: string;
  sourceVersion: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  shortlist: { candidates: ViewerPairwiseShortlistCandidate[] };
  decision: ViewerPairwiseDecisionSlice | null;
  failure: ViewerPairwiseFailure | null;
};

export type CreatePairwiseDecisionJobResponse = {
  reused: boolean;
  job: ViewerPairwiseJobResponse;
};

export type RunPairwiseDecisionJobResponse = {
  ok: true;
  jobId: string;
  jobStatus: string;
  started: false;
  reason:
    | "enqueued_for_worker"
    | "already_running"
    | "already_completed"
    | "failed_not_reusable"
    | "invalid_state";
};

async function parseViewerPairwiseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (res.status === 401) {
    throw new Error("未登录或 token 无效，请先登录（/login）");
  }
  if (res.status === 403) {
    throw new Error("没有权限执行此操作（403）。");
  }
  if (res.status === 404) {
    throw new Error("未找到或无权访问（404）。");
  }
  if (res.status === 409) {
    throw new Error("当前状态不允许此操作（409），请稍后重试。");
  }
  if (res.status === 500) {
    throw new Error("服务暂时不可用（500），请稍后重试。");
  }
  if (!res.ok) {
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

export async function createPairwiseDecisionJob(poolId: string): Promise<CreatePairwiseDecisionJobResponse> {
  const res = await fetch(`${baseUrl}/pairwise-decision/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ poolId: poolId.trim() }),
  });
  return parseViewerPairwiseJson<CreatePairwiseDecisionJobResponse>(res);
}

export async function runPairwiseDecisionJob(jobId: string): Promise<RunPairwiseDecisionJobResponse> {
  const id = jobId.trim();
  const res = await fetch(`${baseUrl}/pairwise-decision/jobs/${encodeURIComponent(id)}/run`, {
    method: "POST",
    headers: authHeaders(),
  });
  return parseViewerPairwiseJson<RunPairwiseDecisionJobResponse>(res);
}

export async function getPairwiseDecisionJob(jobId: string): Promise<ViewerPairwiseJobResponse> {
  const id = jobId.trim();
  const res = await fetch(`${baseUrl}/pairwise-decision/jobs/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  return parseViewerPairwiseJson<ViewerPairwiseJobResponse>(res);
}
