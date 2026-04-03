import { authHeaders } from "./auth";

const baseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

async function handleJson(res: Response) {
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
  if (!text) return {};
  return JSON.parse(text);
}

export type Conversation = {
  id: string;
  viewerUserId: string;
  candidateUserId: string;
  matchResultId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages?: {
    id: string;
    conversationId: string;
    senderUserId: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  }[];
};

export async function createConversation(userId: string) {
  const res = await fetch(`${baseUrl}/chat/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ userId }),
  });
  return handleJson(res);
}

export type ConversationSummaryResponse = {
  summary: string;
  chatStageHint: string;
  generatedAt: string;
};

export async function getConversation(conversationId: string) {
  const res = await fetch(
    `${baseUrl}/chat/conversations/${encodeURIComponent(conversationId)}`,
    {
      headers: authHeaders(),
    },
  );
  return handleJson(res);
}

/** P1-3: read-only placeholder summary (not persisted). */
export async function getConversationSummary(conversationId: string) {
  const res = await fetch(
    `${baseUrl}/chat/conversations/${encodeURIComponent(conversationId)}/summary`,
    {
      headers: authHeaders(),
    },
  );
  return handleJson(res) as Promise<ConversationSummaryResponse>;
}

export async function sendMessage(payload: {
  conversationId: string;
  senderUserId: string;
  content: string;
}) {
  const res = await fetch(`${baseUrl}/chat/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}
