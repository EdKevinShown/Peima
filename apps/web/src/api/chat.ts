import { authHeaders, baseUrl, getApiBaseUrl, handleJson } from "./auth";

export type Conversation = {
  id: string;
  viewerUserId: string;
  candidateUserId: string;
  /** Resolved peer for the authenticated user (GET conversation). */
  peerUserId?: string | null;
  peerNickname?: string | null;
  viewerNickname?: string | null;
  candidateNickname?: string | null;
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

export type CreateConversationOptions = {
  /** M5.5-Chat-R2A: server resolves chat peer from this row + `resolveMatchResultDisplay`. */
  matchResultId?: string;
  /** Chat with a friend from `GET /friends/me`. */
  peerUserId?: string;
};

export async function createConversation(userId: string, options?: CreateConversationOptions) {
  const body: { userId: string; matchResultId?: string; peerUserId?: string } = {
    userId,
  };
  const mid = options?.matchResultId?.trim();
  const peer = options?.peerUserId?.trim();
  if (mid) {
    body.matchResultId = mid;
  }
  if (peer) {
    body.peerUserId = peer;
  }
  const res = await fetch(`${baseUrl}/chat/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });
  return handleJson<unknown>(res);
}

export type ConversationSummaryResponse = {
  summary: string;
  chatStageHint: string;
  generatedAt: string;
  sourceType?: string;
  sourceVersion?: string;
  persisted?: boolean;
};

export async function getConversation(conversationId: string) {
  const res = await fetch(
    `${baseUrl}/chat/conversations/${encodeURIComponent(conversationId)}`,
    {
      headers: authHeaders(),
    },
  );
  return handleJson<Conversation>(res);
}

/** P1/P2: summary（优先持久化行，否则内联规则摘要） */
export async function getConversationSummary(conversationId: string) {
  const res = await fetch(
    `${baseUrl}/chat/conversations/${encodeURIComponent(conversationId)}/summary`,
    {
      headers: authHeaders(),
    },
  );
  return handleJson<ConversationSummaryResponse>(res);
}

/** P2：规则摘要写入持久化行，返回最新快照（与 GET 结构一致） */
export async function generateConversationSummary(conversationId: string) {
  const res = await fetch(
    `${baseUrl}/chat/conversations/${encodeURIComponent(conversationId)}/summary/generate`,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
  return handleJson<ConversationSummaryResponse>(res);
}

/** P6.8：从会话生成待审阅的维度 branch 建议（不落标签直出）。 */
export class ProfileCompletionSuggestionRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ProfileCompletionSuggestionRequestError";
    this.status = status;
  }
}

/** `POST /chat/conversations/:conversationId/profile-completion-suggestion` */
export async function postProfileCompletionSuggestion(
  conversationId: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const init: RequestInit = {
    method: "POST",
    headers: (
      body !== undefined
        ? { "Content-Type": "application/json", ...authHeaders() }
        : { ...authHeaders() }
    ) as HeadersInit,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  const res = await fetch(
    `${baseUrl}/chat/conversations/${encodeURIComponent(conversationId)}/profile-completion-suggestion`,
    init,
  );

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      throw new ProfileCompletionSuggestionRequestError(
        401,
        "未登录或 token 无效，请先登录（/login）",
      );
    }
    if (res.status === 403) {
      throw new ProfileCompletionSuggestionRequestError(
        403,
        "没有权限执行此操作（403）。",
      );
    }
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(parsed.message)) {
        detail = parsed.message.join(", ");
      } else if (parsed.message) {
        detail = String(parsed.message);
      }
    } catch {
      /* keep raw */
    }
    throw new ProfileCompletionSuggestionRequestError(
      res.status,
      detail || `HTTP ${res.status}`,
    );
  }

  if (!text) return {};
  return JSON.parse(text) as unknown;
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
  return handleJson<unknown>(res);
}

export type ConversationTimelineEventType =
  | "conversation_opened"
  | "message_sent"
  | "summary_snapshot"
  | "behavior_signal"
  | "feedback_on_conversation";

export type ConversationTimelineItem = {
  id: string;
  type: ConversationTimelineEventType;
  occurredAt: string;
  title: string;
  detail?: string;
  meta?: {
    sourceId?: string;
    actorUserId?: string;
    rating?: number;
  };
};

export type ConversationTimelineMessagePagination = {
  skip: number;
  limit: number;
  hasMore: boolean;
};

export type ConversationTimelineResponse = {
  conversationId: string;
  generatedAt: string;
  items: ConversationTimelineItem[];
  messagePagination?: ConversationTimelineMessagePagination;
};

/** P3-C：只读关系时间线；P3-3：可选 messageSkip / messageLimit */
export async function getConversationTimeline(
  conversationId: string,
  opts?: { messageSkip?: number; messageLimit?: number },
) {
  const params = new URLSearchParams();
  if (opts?.messageSkip != null && opts.messageSkip > 0) {
    params.set("messageSkip", String(opts.messageSkip));
  }
  if (opts?.messageLimit != null) {
    params.set("messageLimit", String(opts.messageLimit));
  }
  const q = params.toString();
  const path = `/chat/conversations/${encodeURIComponent(conversationId)}/timeline${q ? `?${q}` : ""}`;
  const url = new URL(path, getApiBaseUrl()).href;
  const res = await fetch(url, {
    headers: authHeaders(),
  });
  return handleJson<ConversationTimelineResponse>(res);
}
