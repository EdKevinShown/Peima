import { authHeaders, baseUrl } from "./auth";

const TOKEN_STORAGE_KEY = "peimaTestObservabilityToken";

export function getTestingObservabilityToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

export function setTestingObservabilityToken(token: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
}

function observabilityHeaders(debugToken: string): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const auth = authHeaders() as Record<string, string>;
  if (auth.Authorization) {
    h.Authorization = auth.Authorization;
  }
  if (debugToken) {
    h["x-peima-debug-token"] = debugToken;
  }
  return h;
}

async function handleJson(res: Response) {
  if (res.status === 404) {
    throw new Error(
      "测试监视器未启用（需 PEIMA_TEST_OBSERVABILITY_ENABLED=1 并重启 API）",
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "未授权：请用管理员账号登录（PEIMA_ADMIN_USER_IDS），或填写正确的 x-peima-debug-token",
    );
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid JSON (${res.status})`);
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function fetchTestingObservabilityUsers(token: string, limit = 50) {
  const res = await fetch(
    `${baseUrl}/admin/testing-observability/users?limit=${limit}`,
    { headers: observabilityHeaders(token) },
  );
  return handleJson(res);
}

export async function fetchTestingObservabilityUserDetail(
  token: string,
  userId: string,
) {
  const res = await fetch(
    `${baseUrl}/admin/testing-observability/users/${encodeURIComponent(userId)}`,
    { headers: observabilityHeaders(token) },
  );
  return handleJson(res);
}

export async function fetchTestingObservabilityMatchingQueue(
  token: string,
  status = "waiting",
  limit = 50,
) {
  const params = new URLSearchParams({ status, limit: String(limit) });
  const res = await fetch(
    `${baseUrl}/admin/testing-observability/matching-queue?${params}`,
    { headers: observabilityHeaders(token) },
  );
  return handleJson(res);
}

export async function fetchTestingObservabilityMatches(
  token: string,
  limit = 50,
) {
  const res = await fetch(
    `${baseUrl}/admin/testing-observability/matches?limit=${limit}`,
    { headers: observabilityHeaders(token) },
  );
  return handleJson(res);
}

export async function fetchTestingObservabilityEvents(
  token: string,
  userId?: string,
) {
  const qs = userId
    ? `?userId=${encodeURIComponent(userId)}&limit=50`
    : "?limit=50";
  const res = await fetch(
    `${baseUrl}/admin/testing-observability/events${qs}`,
    { headers: observabilityHeaders(token) },
  );
  return handleJson(res);
}

export async function submitTestingMatchFeedback(
  token: string,
  body: {
    userId: string;
    matchResultId?: string;
    rating: string;
    reasonCodes?: string[];
    freeText?: string;
  },
) {
  const res = await fetch(`${baseUrl}/admin/testing-observability/match-feedback`, {
    method: "POST",
    headers: observabilityHeaders(token),
    body: JSON.stringify(body),
  });
  return handleJson(res);
}
