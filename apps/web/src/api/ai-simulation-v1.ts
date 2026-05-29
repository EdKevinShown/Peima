import { authHeaders, baseUrl, handleJson } from "./auth";

/** One row from GET /admin/ai-simulation/v1/jobs/:jobId → results[]. */
export type AiSimulationV1JobResultItem = {
  candidateUserId: string;
  status: string;
  attemptCount: number;
  transcriptLite: unknown;
  evaluator: unknown;
  failureDetail: { path?: string; reason?: string } | null;
  errorCode: string | null;
  rrmSimResult?: unknown;
};

/** Admin GET job — M3 只读多候选人 RRM-Sim 对比（不参与真实排序）。 */
export type RrmSimMultiCandidateDiagnostic = {
  jobId: string;
  viewerUserId: string;
  sourceVersion: string;
  items: Array<{
    candidateUserId: string;
    status: string;
    existingRank: number | null;
    simulationRankScore: number | null;
    aiSimulationV2Full: boolean;
    simulatedRhythmScore: number | null;
    suggestedAction: string | null;
    progressionWindow: string | null;
    fallbackUsed: boolean | null;
    rrmUnavailableReason: string | null;
  }>;
  rankings: {
    existingSimulationRank: string[];
    rrmRhythmRank: string[];
  };
  diagnostics: {
    rrmAvailableCount: number;
    fallbackCount: number;
    scoreRange: { min: number; max: number; spread: number };
    scoreDistributionFlag: "ok" | "too_narrow" | "too_many_fallbacks";
    topCandidateChangedIfRrmOnly: boolean;
  };
};

/** M4.0 admin-only read-only RRM ranking proposal (not applied to worker or finalScore). */
export type RrmRankingProposal = {
  schemaVersion: 1;
  sourceVersion: string;
  mode: "readonly";
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  existingTopCandidateUserId: string | null;
  rrmTopCandidateUserId: string | null;
  topCandidateChanged: boolean;
  scoreDistributionFlag: "ok" | "too_narrow" | "too_many_fallbacks";
  confidenceLevel: "low" | "medium" | "high";
  recommendation:
    | "do_not_use_for_ranking"
    | "insufficient_separation"
    | "review_manually"
    | "supports_existing_rank"
    | "diagnostic_only";
  items: Array<{
    candidateUserId: string;
    existingRank: number | null;
    rrmRank: number | null;
    simulatedRhythmScore: number | null;
    suggestedAction: string | null;
    progressionWindow: string | null;
    fallbackUsed: boolean | null;
    reasonSummary: string;
  }>;
  warnings: string[];
};

export type AiSimulationV1JobResponse = {
  simulationJobId: string;
  viewerUserId: string;
  jobStatus: string;
  poolId: string;
  simulationQueueActual: string[];
  hintSnapshot: unknown;
  shortlistBinding?: unknown;
  shortlistDecisionV0?: unknown;
  shortlistFourDimV0?: unknown;
  shortlistScenariosV0?: unknown;
  jobAuditV0?: {
    schemaVersion: string;
    jobStatus: string;
    shortlistBindingPresent: boolean;
    sidecarTrioPresent: boolean;
    itemCounts: {
      total: number;
      queued: number;
      running: number;
      succeeded: number;
      failed: number;
    };
    rankConsistent: boolean | null;
    sidecarSuppressedReason: string;
    specClassification: string;
    diagnosticBucket: string;
    buildabilityDetail: string;
  };
  results: AiSimulationV1JobResultItem[];
  rrmSimMultiCandidateDiagnostic?: RrmSimMultiCandidateDiagnostic;
  rrmRankingProposal?: RrmRankingProposal;
};

/** Viewer GET `GET /ai-simulation/v1/jobs/:jobId` — no admin-only RRM diagnostics or M4.0 proposal. */
export type AiSimulationV1ViewerJobResponse = Omit<
  AiSimulationV1JobResponse,
  "rrmSimMultiCandidateDiagnostic" | "rrmRankingProposal"
>;

export type AiSimulationV1JobTriageRow = {
  simulationJobId: string;
  viewerUserId: string;
  poolId: string;
  jobStatus: string;
  createdAt: string;
  updatedAt: string;
  shortlistBindingPresent: boolean;
  sidecarTrioPresent: boolean;
  rankConsistent: boolean | null;
  sidecarSuppressedReason: string;
  specClassification: string;
  diagnosticBucket: string;
  buildabilityDetail: string;
  itemCounts: {
    total: number;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
  };
  hasFailedItem: boolean;
};

export async function getAdminAiSimulationV1Job(jobId: string): Promise<AiSimulationV1JobResponse> {
  const res = await fetch(`${baseUrl}/admin/ai-simulation/v1/jobs/${encodeURIComponent(jobId)}`, {
    headers: authHeaders(),
  });
  return handleJson<AiSimulationV1JobResponse>(res);
}

/** Viewer job read (JWT; job must belong to the authenticated user). Excludes M4.0 / multi-candidate admin diagnostics. */
export async function getViewerAiSimulationV1Job(jobId: string): Promise<AiSimulationV1ViewerJobResponse> {
  const res = await fetch(`${baseUrl}/ai-simulation/v1/jobs/${encodeURIComponent(jobId)}`, {
    headers: authHeaders(),
  });
  return handleJson<AiSimulationV1ViewerJobResponse>(res);
}

export async function getAdminAiSimulationV1JobsTriage(query?: {
  limit?: number;
  jobStatus?: string;
  sidecarSuppressedReason?: string;
  diagnosticBucket?: string;
  sidecarTrioPresent?: boolean;
  rankConsistent?: boolean;
  hasFailedItem?: boolean;
}): Promise<AiSimulationV1JobTriageRow[]> {
  const params = new URLSearchParams();
  if (query?.limit != null) params.set("limit", String(query.limit));
  if (query?.jobStatus) params.set("jobStatus", query.jobStatus);
  if (query?.sidecarSuppressedReason) params.set("sidecarSuppressedReason", query.sidecarSuppressedReason);
  if (query?.diagnosticBucket) params.set("diagnosticBucket", query.diagnosticBucket);
  if (query?.sidecarTrioPresent != null) params.set("sidecarTrioPresent", String(query.sidecarTrioPresent));
  if (query?.rankConsistent != null) params.set("rankConsistent", String(query.rankConsistent));
  if (query?.hasFailedItem != null) params.set("hasFailedItem", String(query.hasFailedItem));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${baseUrl}/admin/ai-simulation/v1/jobs${suffix}`, {
    headers: authHeaders(),
  });
  return handleJson<AiSimulationV1JobTriageRow[]>(res);
}

export type AiSimulationV1RunJobResponse = {
  ok: true;
  jobId: string;
  jobStatus: string;
  started: boolean;
  reason?: string;
};

/** Admin: trigger AI simulation job run (M3.2: API returns immediately; LLM continues in background). */
export async function postAdminAiSimulationV1RunJob(
  jobId: string,
  options?: { timeoutMs?: number },
): Promise<AiSimulationV1RunJobResponse> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const tid = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/admin/ai-simulation/v1/jobs/${encodeURIComponent(jobId)}/run`, {
      method: "POST",
      headers: authHeaders(),
      signal: controller.signal,
    });
    return handleJson<AiSimulationV1RunJobResponse>(res);
  } finally {
    window.clearTimeout(tid);
  }
}
