import { authHeaders, baseUrl, handleJson } from "./auth";
import { resolveAdminCapabilitiesFetch } from "../utils/adminCapabilitiesFetch.js";

export type AdminCapabilities = {
  batchMatchTrigger: boolean;
};

export type AdminMyAiRecordsResponse = {
  userId: string;
  generatedAt: string;
  note: string;
  conversationSummaries: Array<{
    id: string;
    conversationId: string;
    viewerUserId: string;
    candidateUserId: string;
    sourceType: string;
    sourceVersion: string;
    summaryPreview: string;
    createdAt: string;
  }>;
  profileSuggestions: Array<{
    id: string;
    status: string;
    sourceType: string;
    sourceVersion: string;
    sourceConversationId: string | null;
    createdAt: string;
    updatedAt: string;
    resolvedAt: string | null;
  }>;
  aiSimulationJobs: Array<{
    id: string;
    poolId: string;
    jobStatus: string;
    schemaVersion: string;
    runSpecVersion: string;
    hintSource: string;
    createdAt: string;
    updatedAt: string;
  }>;
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

export type AdminCapabilitiesFetchResult =
  | { ok: true; capabilities: AdminCapabilities }
  | { ok: false; reason: "unauthorized" | "forbidden" | "error" };

export { resolveAdminCapabilitiesFetch };

/** Never throws on 401/403 — used to gate admin nav without console noise. */
export async function fetchAdminCapabilities(): Promise<AdminCapabilitiesFetchResult> {
  const res = await fetch(`${baseUrl}/admin/capabilities`, {
    headers: authHeaders(),
  });
  if (res.status === 401) return { ok: false, reason: "unauthorized" };
  if (res.status === 403) return { ok: false, reason: "forbidden" };
  if (!res.ok) return { ok: false, reason: "error" };
  const text = await res.text();
  let body: Partial<AdminCapabilities> = {};
  if (text) {
    try {
      body = JSON.parse(text) as AdminCapabilities;
    } catch {
      return { ok: false, reason: "error" };
    }
  }
  return resolveAdminCapabilitiesFetch(res.status, body);
}

export async function getAdminCapabilities(): Promise<AdminCapabilities> {
  const result = await fetchAdminCapabilities();
  if (result.ok) return result.capabilities;
  return { batchMatchTrigger: false };
}

export async function runAdminBatchMatchOnce(): Promise<{ ok: true }> {
  const res = await fetch(`${baseUrl}/admin/batch-match/run-once`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleJson<{ ok: true }>(res);
}

export async function getAdminMyAiRecords(): Promise<AdminMyAiRecordsResponse> {
  const res = await fetch(`${baseUrl}/admin/my-ai-records`, {
    headers: authHeaders(),
  });
  return handleJson<AdminMyAiRecordsResponse>(res);
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

export async function getMatchingObservabilitySummary(query?: {
  limit?: number;
  sinceDays?: number;
}) {
  const qs = new URLSearchParams();
  if (query?.limit != null) qs.set("limit", String(query.limit));
  if (query?.sinceDays != null) qs.set("sinceDays", String(query.sinceDays));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`${baseUrl}/admin/matching-observability/summary${suffix}`, {
    headers: authHeaders(),
  });
  return handleJson(res);
}
