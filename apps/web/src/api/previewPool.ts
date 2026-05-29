import { authHeaders, baseUrl, handleJson } from "./auth";

export type PreviewPoolItemMeta = {
  slotReason: string;
  shortHint?: string;
  tags?: string[];
};

export type PreviewPoolItem = {
  id: string;
  previewPoolId: string;
  userId: string;
  candidateUserId: string;
  candidateType: string;
  displayMode: string;
  rankInPool: number;
  baseScore: number | null;
  itemMeta?: PreviewPoolItemMeta | null;
  createdAt: string;
  updatedAt: string;
};

export type PreviewPoolRecord = {
  id: string;
  userId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type LatestPreviewPoolResponse = {
  previewPool: PreviewPoolRecord;
  items: PreviewPoolItem[];
};

/** P7.10-r11: read-only — legacy pool generate removed. */
export async function getLatestPreviewPool(userId: string) {
  const url = `${baseUrl}/preview-pool/user/${encodeURIComponent(userId)}/latest`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleJson<LatestPreviewPoolResponse>(res);
}
