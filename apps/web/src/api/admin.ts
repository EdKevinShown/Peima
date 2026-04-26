import { authHeaders, baseUrl, handleJson } from "./auth";

export type AdminCapabilities = {
  batchMatchTrigger: boolean;
};

/** Orchestrator MVP envelope (narrowed to fields the web caller needs). */
export type AdminPostPoolOrchestrationMvpEnvelope = {
  schemaVersion: "post_pool_orchestration_mvp_v0";
  finalMatchConsumptionHint: {
    source: "orchestrator_a2";
    poolId: string;
    runMode: string;
    ready: boolean;
    prescreen: {
      candidateCount: number;
      bucketCounts: { promote: number; neutral: number; demote: number };
    };
    aiSimulation: {
      enqueued: boolean;
      simulationJobId?: string;
      acceptedCandidateCount?: number;
    };
    notes?: string[];
  };
  deeplink: {
    finalMatchUrl: string;
    finalMatchPath: string;
    query: { userId: string; aiSimJobId: string | null };
    ready: boolean;
  };
};

export type AdminPostPoolOrchestrationMvpBody = {
  viewerUserId: string;
  poolId: string;
  runMode: "shadow" | "hint_only" | "mvp";
  candidateUserIdsOverride?: string[];
};

export async function getAdminCapabilities(): Promise<AdminCapabilities> {
  const res = await fetch(`${baseUrl}/admin/capabilities`, {
    headers: authHeaders(),
  });
  if (res.status === 401) {
    return { batchMatchTrigger: false };
  }
  return handleJson<AdminCapabilities>(res);
}

export async function runAdminBatchMatchOnce(): Promise<{ ok: true }> {
  const res = await fetch(`${baseUrl}/admin/batch-match/run-once`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleJson<{ ok: true }>(res);
}

export async function runAdminPostPoolOrchestrationMvp(
  body: AdminPostPoolOrchestrationMvpBody,
): Promise<AdminPostPoolOrchestrationMvpEnvelope> {
  const res = await fetch(`${baseUrl}/admin/post-pool-deep-screen/run-orchestration-mvp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });
  return handleJson<AdminPostPoolOrchestrationMvpEnvelope>(res);
}
