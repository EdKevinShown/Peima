import { authHeaders, baseUrl, handleJson } from "./auth";

/** Minimal fields used by chat page banner */
export type ProfileSuggestionRow = {
  id: string;
  userId: string;
  status: string;
  sourceType: string;
  sourceVersion: string;
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
