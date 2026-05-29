import { authHeaders, baseUrl } from "./auth";

export const PHOTO_REVIEW_REASON_CODES = [
  "MANUAL_REJECTED",
  "NEEDS_REUPLOAD",
  "FACE_NOT_CLEAR",
  "MULTIPLE_FACES_REVIEW",
  "SUSPECTED_NON_PERSON",
  "INAPPROPRIATE_CONTENT",
  "LOW_QUALITY",
  "USER_REQUESTED_REVIEW",
  "MANUAL_OVERRIDE",
] as const;

export type PhotoReviewReasonCode = (typeof PHOTO_REVIEW_REASON_CODES)[number];

export type AdminPhotoReviewDetectionSummary = {
  faceCount?: number;
  warnings?: string[];
  primaryFace?: unknown;
  quality?: {
    meanLuma?: number;
    laplacianVariance?: number;
    width?: number;
    height?: number;
  };
};

export type AdminPhotoReviewListItem = {
  imageId: string;
  userId: string;
  imageUrl: string;
  detectionStatus: string;
  detectionReasonCodes: string[];
  detectionRulesVersion: string | null;
  detectedAt: string | null;
  reviewStatus: string;
  reviewReasonCodes: string[];
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  detectionSummary: AdminPhotoReviewDetectionSummary | null;
};

export type AdminPhotoReviewDetail = AdminPhotoReviewListItem & {
  detectionScoreJson: unknown;
  user: { userId: string; nickname: string };
};

export type AdminPhotoReviewListResponse = {
  items: AdminPhotoReviewListItem[];
  nextCursor: string | null;
};

export type ListAdminPhotoReviewParams = {
  reviewStatus?: string;
  detectionStatus?: string;
  reasonCode?: string;
  hasWarnings?: boolean;
  userId?: string;
  createdAfter?: string;
  createdBefore?: string;
  limit?: number;
  cursor?: string;
};

export type ReviewPhotoActionBody = {
  reasonCodes?: string[];
  note?: string;
};

/** Serialize list query; omits empty / undefined fields. */
export function buildAdminPhotoReviewListQuery(
  params: ListAdminPhotoReviewParams,
): string {
  const q = new URLSearchParams();
  if (params.reviewStatus) q.set("reviewStatus", params.reviewStatus);
  if (params.detectionStatus) q.set("detectionStatus", params.detectionStatus);
  if (params.reasonCode?.trim()) q.set("reasonCode", params.reasonCode.trim());
  if (params.hasWarnings === true) q.set("hasWarnings", "true");
  if (params.hasWarnings === false) q.set("hasWarnings", "false");
  if (params.userId?.trim()) q.set("userId", params.userId.trim());
  if (params.createdAfter) q.set("createdAfter", params.createdAfter);
  if (params.createdBefore) q.set("createdBefore", params.createdBefore);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function validateReviewReasonCodes(reasonCodes: string[]): string | null {
  if (!reasonCodes.length) {
    return "请至少选择一个 reasonCode";
  }
  for (const code of reasonCodes) {
    if (!PHOTO_REVIEW_REASON_CODES.includes(code as PhotoReviewReasonCode)) {
      return `无效的 reasonCode: ${code}`;
    }
  }
  return null;
}

async function parseAdminPhotoReviewError(res: Response): Promise<never> {
  const text = await res.text();
  let detail = text;
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(body.message)) {
      detail = body.message.join(", ");
    } else if (body.message) {
      detail = String(body.message);
    }
  } catch {
    /* raw */
  }

  if (res.status === 401) {
    throw new Error("登录已失效，请重新登录后再访问照片审核。");
  }
  if (res.status === 403) {
    throw new Error(
      detail?.trim() || "无权限访问照片审核（需要运营或管理员账号）。",
    );
  }
  if (res.status === 404) {
    throw new Error(detail?.trim() || "照片不存在或已被删除。");
  }
  if (res.status === 400) {
    throw new Error(detail?.trim() || "请求参数校验失败，请检查 reasonCodes 与 note。");
  }
  if (res.status === 409) {
    throw new Error(
      detail?.trim() ||
        "照片审核状态已被其他人更新，请刷新列表后重试。",
    );
  }
  throw new Error(detail?.trim() || `请求失败（HTTP ${res.status}），请稍后重试。`);
}

async function adminPhotoReviewJson<T>(
  res: Response,
): Promise<T> {
  if (!res.ok) {
    return parseAdminPhotoReviewError(res);
  }
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
    ...authHeaders(),
  };
}

export async function listAdminPhotoReviewItems(
  params: ListAdminPhotoReviewParams = {},
): Promise<AdminPhotoReviewListResponse> {
  const query = buildAdminPhotoReviewListQuery({
    limit: 20,
    ...params,
  });
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/admin/photo-review/items${query}`, {
      headers: authHeaders(),
    });
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return adminPhotoReviewJson<AdminPhotoReviewListResponse>(res);
}

export async function getAdminPhotoReviewItem(
  imageId: string,
): Promise<AdminPhotoReviewDetail> {
  let res: Response;
  try {
    res = await fetch(
      `${baseUrl}/admin/photo-review/items/${encodeURIComponent(imageId)}`,
      { headers: authHeaders() },
    );
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return adminPhotoReviewJson<AdminPhotoReviewDetail>(res);
}

export async function approveAdminPhotoReviewItem(
  imageId: string,
  body: ReviewPhotoActionBody = {},
): Promise<AdminPhotoReviewDetail> {
  let res: Response;
  try {
    res = await fetch(
      `${baseUrl}/admin/photo-review/items/${encodeURIComponent(imageId)}/approve`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      },
    );
  } catch {
    throw new Error("网络异常，请稍后重试。");
  }
  return adminPhotoReviewJson<AdminPhotoReviewDetail>(res);
}

export async function rejectAdminPhotoReviewItem(
  imageId: string,
  body: ReviewPhotoActionBody,
): Promise<AdminPhotoReviewDetail> {
  const err = validateReviewReasonCodes(body.reasonCodes ?? []);
  if (err) throw new Error(err);

  let res: Response;
  try {
    res = await fetch(
      `${baseUrl}/admin/photo-review/items/${encodeURIComponent(imageId)}/reject`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("请")) throw e;
    throw new Error("网络异常，请稍后重试。");
  }
  return adminPhotoReviewJson<AdminPhotoReviewDetail>(res);
}

export async function needsReuploadAdminPhotoReviewItem(
  imageId: string,
  body: ReviewPhotoActionBody,
): Promise<AdminPhotoReviewDetail> {
  const err = validateReviewReasonCodes(body.reasonCodes ?? []);
  if (err) throw new Error(err);

  let res: Response;
  try {
    res = await fetch(
      `${baseUrl}/admin/photo-review/items/${encodeURIComponent(imageId)}/needs-reupload`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("请")) throw e;
    throw new Error("网络异常，请稍后重试。");
  }
  return adminPhotoReviewJson<AdminPhotoReviewDetail>(res);
}
