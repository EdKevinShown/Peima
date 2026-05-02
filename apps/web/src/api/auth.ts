const TOKEN_KEY = "peimaToken";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function authHeaders() {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

const DEFAULT_API_BASE = "http://localhost:3000";

/**
 * API 根地址（与 chat / copilot 等共用）。
 * 若误将 VITE_API_BASE_URL 指到 Vite 开发端口，会导致 fetch 打到前端 dev server 并出现 Cannot GET。
 */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw == null || typeof raw !== "string") {
    return DEFAULT_API_BASE;
  }
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) {
    return DEFAULT_API_BASE;
  }
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    if (host === "localhost" || host === "127.0.0.1") {
      if (port === "5173" || port === "5174" || port === "4173") {
        return DEFAULT_API_BASE;
      }
    }
  } catch {
    return DEFAULT_API_BASE;
  }
  return trimmed;
}

export const baseUrl = getApiBaseUrl();

export async function handleJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("未登录或 token 无效，请先登录（/login）");
    }
    if (res.status === 403) {
      throw new Error("没有权限执行此操作（403）。若需全局数据，请确认账号是否在白名单内。");
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

export type RegisterResponse = {
  token: string;
  user: {
    id: string;
    phone: string;
    nickname: string;
  };
};

export async function register(payload: { phone: string; nickname: string }) {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleJson<RegisterResponse>(res);
}

export type LoginResponse = RegisterResponse;

export async function login(payload: { phone: string }) {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleJson<LoginResponse>(res);
}

export type MeResponse = {
  id: string;
  phone: string;
  nickname: string;
  gender: string;
  age: number | null;
  city: string;
  height: number | null;
  education: string;
  occupation: string;
  relationshipGoal: string;
  bio: string;
  createdAt: string;
  updatedAt: string;
};

export async function getMe() {
  const res = await fetch(`${baseUrl}/auth/me`, {
    headers: {
      ...authHeaders(),
    },
  });
  return handleJson<MeResponse>(res);
}

