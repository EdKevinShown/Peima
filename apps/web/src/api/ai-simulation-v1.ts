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
};

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

/** Admin: run AI simulation job once (sync LLM work on API). Caller should catch errors / abort. */
export async function postAdminAiSimulationV1RunJob(
  jobId: string,
  options?: { timeoutMs?: number },
): Promise<{ ok: true }> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const tid = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/admin/ai-simulation/v1/jobs/${encodeURIComponent(jobId)}/run`, {
      method: "POST",
      headers: authHeaders(),
      signal: controller.signal,
    });
    return handleJson<{ ok: true }>(res);
  } finally {
    window.clearTimeout(tid);
  }
}
