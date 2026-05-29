import { authHeaders, baseUrl, handleJson } from "./auth";

export type PreviewPoolItemMeta = {
  slotReason: string;
  shortHint?: string;
  tags?: string[];
  candidateImageUrl?: string;
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

export type PreviewPoolShortlistEvidence = {
  rankInPool: number;
  candidateType: string;
  displayMode: string;
  baseScore: number | null;
  preferenceScore: number;
  profileScalar: number;
  styleScore: number;
  styleWeightActive: boolean;
};

export type PreviewPoolShortlistContract = {
  schemaVersion: "preview_pool_shortlist_contract_v0";
  viewerUserId: string;
  poolId: string;
  shortlist: {
    size: number;
    candidateUserIds: string[];
  };
  staticEvidence: Record<string, PreviewPoolShortlistEvidence>;
  exclusionReport: Array<{
    candidateUserId: string;
    reasonCode: string;
    detail: string;
  }>;
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
  shortlistContract?: PreviewPoolShortlistContract;
};

/** P7.10-r11: read-only — legacy pool generate removed. */
export async function getLatestPreviewPool(userId: string) {
  const url = `${baseUrl}/preview-pool/user/${encodeURIComponent(userId)}/latest`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleJson<LatestPreviewPoolResponse>(res);
}

/** Dev/QA only: creates a local readonly latest pool for smoke testing. */
export async function seedLatestPreviewPoolForTest() {
  const res = await fetch(`${baseUrl}/test/preview-pool/seed-latest`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleJson<LatestPreviewPoolResponse>(res);
}
