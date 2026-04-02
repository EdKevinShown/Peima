const TOKEN_KEY = "peimaToken";

export function getToken() {
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

export const baseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

export async function handleJson<T>(res: Response): Promise<T> {
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

