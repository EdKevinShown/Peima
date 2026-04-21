import { authHeaders, baseUrl, handleJson } from "./auth";

/** Minimal fields used by chat page banner */
export type ProfileSuggestionRow = {
  id: string;
  userId: string;
  status: string;
  sourceType: string;
  sourceVersion: string;
  sourceConversationId?: string | null;
  reviewSummary?: unknown | null;
  proposedPatch: unknown;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export async function listMyProfileSuggestions() {
  const res = await fetch(`${baseUrl}/profile-suggestions/mine`, {
    headers: authHeaders(),
  });
  return handleJson<ProfileSuggestionRow[]>(res);
}

export async function acceptProfileSuggestion(suggestionId: string) {
  const res = await fetch(
    `${baseUrl}/profile-suggestions/${encodeURIComponent(suggestionId)}/accept`,
    { method: "POST", headers: authHeaders() },
  );
  return handleJson<ProfileSuggestionRow>(res);
}

export async function dismissProfileSuggestion(suggestionId: string) {
  const res = await fetch(
    `${baseUrl}/profile-suggestions/${encodeURIComponent(suggestionId)}/dismiss`,
    { method: "POST", headers: authHeaders() },
  );
  return handleJson<ProfileSuggestionRow>(res);
}
