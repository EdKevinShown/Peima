import { authHeaders, baseUrl, handleJson } from "./auth";

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
