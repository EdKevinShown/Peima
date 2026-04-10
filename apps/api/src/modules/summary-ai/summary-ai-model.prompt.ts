import type { Prisma } from "@peima/database";

type MessageRow = {
  senderUserId: string;
  content: string;
  createdAt: Date;
};

const MAX_MESSAGES = 50;
const MAX_CONTENT_PER_MSG = 500;

/**
 * Model must return a single JSON object only (no markdown).
 * Validated by mapModelJsonToSummary.
 */
export const SUMMARY_AI_SYSTEM_PROMPT = `你是配吗（Peima）会话摘要助手，仅根据提供的会话消息生成「只读摘要」。
你必须只输出一个 JSON 对象，不要 markdown、不要代码块、不要解释文字。

JSON 字段（全部为必填）：
- conversationId: 字符串，必须与用户消息中给出的会话 ID 完全一致。
- summary: 字符串，中文，概括当前对话要点与阶段；语气中立、尊重双方；不编造输入中未出现的具体事实。
- chatStageHint: 字符串，中文一句，对用户下一步沟通的轻量提示（不代发消息、不涉及站外行动指令）。`;

type Conv = Prisma.ConversationGetPayload<{ include: { messages: true } }>;

export function buildSummaryUserContent(
  conversationId: string,
  conversation: Conv,
): string {
  const lines: string[] = [
    `会话ID：${conversationId}`,
    `viewerUserId=${conversation.viewerUserId} candidateUserId=${conversation.candidateUserId}`,
    "以下消息按时间升序（每条内容已截断）：",
  ];

  const msgs = conversation.messages as MessageRow[];
  const slice = msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs;

  for (const m of slice) {
    const role =
      m.senderUserId === conversation.viewerUserId
        ? "viewer"
        : m.senderUserId === conversation.candidateUserId
          ? "candidate"
          : "other";
    const body =
      m.content.length > MAX_CONTENT_PER_MSG
        ? `${m.content.slice(0, MAX_CONTENT_PER_MSG)}…`
        : m.content;
    lines.push(`[${role}] ${body}`);
  }

  return lines.join("\n");
}
