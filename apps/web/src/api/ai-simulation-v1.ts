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
  results: AiSimulationV1JobResultItem[];
};

export async function getAdminAiSimulationV1Job(jobId: string): Promise<AiSimulationV1JobResponse> {
  const res = await fetch(`${baseUrl}/admin/ai-simulation/v1/jobs/${encodeURIComponent(jobId)}`, {
    headers: authHeaders(),
  });
  return handleJson<AiSimulationV1JobResponse>(res);
}
