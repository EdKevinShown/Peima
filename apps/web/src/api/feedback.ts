import { authHeaders, baseUrl, handleJson } from "./auth";

export type SubmitFeedbackPayload = {
  userId: string;
  subjectKind: string;
  subjectId: string;
  rating?: number;
  tags?: string[];
  comment?: string;
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
