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

export async function getLatestPreviewPool(userId: string) {
  const url = `${baseUrl}/preview-pool/user/${encodeURIComponent(userId)}/latest`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleJson<LatestPreviewPoolResponse>(res);
}

/** POST /preview-pool/generate — requires JWT userId === body.userId; needs ≥6 other users with images. */
export async function generatePreviewPool(userId: string) {
  const res = await fetch(`${baseUrl}/preview-pool/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ userId }),
  });
  return handleJson<LatestPreviewPoolResponse>(res);
}
