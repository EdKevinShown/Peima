import { authHeaders, baseUrl, handleJson } from "./auth";

/** P6.12 v0 conversation feedback JSON (server-validated; omit for legacy P4). */
export type P612StructuredPayloadV0 = {
  schemaVersion: 1;
  kind: "p6.12_conversation_v0";
  conversationId: string;
  matchResultId?: string;
  targetUserId?: string;
  overallRating: number;
  continueIntent: number;
  comfortLevel: number;
  replyQuality: number;
  safetyFeeling: number;
  awkwardness: number;
};

export type SubmitFeedbackPayload = {
  userId: string;
  subjectKind: string;
  subjectId: string;
  rating?: number;
  tags?: string[];
  comment?: string;
  /** P6.12: when set, use matching sourceVersion + rule_based + conversation. */
  structuredPayload?: P612StructuredPayloadV0;
  sourceType: string;
  sourceVersion: string;
  recordedAt?: string;
};

export async function submitFeedback(payload: SubmitFeedbackPayload) {
  const res = await fetch(`${baseUrl}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function listMyFeedback() {
  const res = await fetch(`${baseUrl}/feedback/mine`, {
    headers: authHeaders(),
  });
  return handleJson<unknown[]>(res);
}
