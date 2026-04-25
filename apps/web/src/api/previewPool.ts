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

/** POST /preview-pool/generate — JWT userId === body.userId; ≥6 gated others (images + profile + preference gate); 6 槽为 visual(1–2)/preference(3–4)/backup(5–6)。 */
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
