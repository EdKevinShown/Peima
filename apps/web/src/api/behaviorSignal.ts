import { authHeaders, baseUrl, handleJson } from "./auth";

/** Mirrors `P2SourceType` in `@peima/shared` (web 未依赖该包时用于表单). */
export const P2_SOURCE_TYPE_OPTIONS = [
  "rule_based",
  "template_based",
  "placeholder",
  "hybrid",
] as const;

export type BehaviorSignalRow = {
  id: string;
  userId: string;
  eventType: string;
  sourceType: string;
  sourceVersion: string;
  occurredAt: string;
  conversationId: string | null;
  sessionId: string | null;
  properties: unknown;
  createdAt: string;
  updatedAt: string;
};

export type CreateBehaviorSignalPayload = {
  userId: string;
  eventType: string;
  sourceType: string;
  sourceVersion: string;
  occurredAt?: string;
  conversationId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
};

export async function listMyBehaviorSignals() {
  const res = await fetch(`${baseUrl}/behavior-signals/mine`, {
    headers: authHeaders(),
  });
  return handleJson<BehaviorSignalRow[]>(res);
}

export async function createBehaviorSignal(payload: CreateBehaviorSignalPayload) {
  const res = await fetch(`${baseUrl}/behavior-signals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  return handleJson<BehaviorSignalRow>(res);
}
