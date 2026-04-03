import { authHeaders } from "./auth";

const baseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

async function handleJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("未登录或 token 无效，请先登录（/login）");
    }
    let detail = text;
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(body.message)) {
        detail = body.message.join(", ");
      } else if (body.message) {
        detail = String(body.message);
      }
    } catch {
      /* use raw text */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

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
