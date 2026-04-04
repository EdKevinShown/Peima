import type { ConversationTimelineItemDto } from "./dto/conversation-timeline.response";

export const CHAT_TIMELINE_MESSAGE_LIMIT = 200;

const FEEDBACK_SUBJECT_CONVERSATION = "conversation";

export function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export function mapConversationOpened(params: {
  conversationId: string;
  createdAt: Date;
}): ConversationTimelineItemDto {
  return {
    id: `conversation_opened:${params.conversationId}`,
    type: "conversation_opened",
    occurredAt: params.createdAt.toISOString(),
    title: "会话已开始",
    meta: { sourceId: params.conversationId },
  };
}

export function mapMessage(params: {
  messageId: string;
  senderUserId: string;
  tokenUserId: string;
  content: string;
  createdAt: Date;
}): ConversationTimelineItemDto {
  const mine = params.senderUserId === params.tokenUserId;
  return {
    id: `message_sent:${params.messageId}`,
    type: "message_sent",
    occurredAt: params.createdAt.toISOString(),
    title: mine ? "你发送了一条消息" : "对方发送了一条消息",
    detail: truncateText(params.content, 80),
    meta: {
      sourceId: params.messageId,
      actorUserId: params.senderUserId,
    },
  };
}

export function mapSummarySnapshot(params: {
  summaryId: string;
  createdAt: Date;
  summary: string;
}): ConversationTimelineItemDto {
  return {
    id: `summary_snapshot:${params.summaryId}`,
    type: "summary_snapshot",
    occurredAt: params.createdAt.toISOString(),
    title: "摘要快照已生成",
    detail: truncateText(params.summary, 120),
    meta: { sourceId: params.summaryId },
  };
}

export function mapBehaviorSignal(params: {
  signalId: string;
  userId: string;
  eventType: string;
  occurredAt: Date;
  properties: unknown;
}): ConversationTimelineItemDto {
  let detail: string | undefined;
  if (params.properties != null) {
    try {
      const s = JSON.stringify(params.properties);
      detail = truncateText(s, 160);
    } catch {
      detail = undefined;
    }
  }
  return {
    id: `behavior_signal:${params.signalId}`,
    type: "behavior_signal",
    occurredAt: params.occurredAt.toISOString(),
    title: `行为信号：${params.eventType}`,
    detail,
    meta: { sourceId: params.signalId, actorUserId: params.userId },
  };
}

export function mapFeedbackOnConversation(params: {
  feedbackId: string;
  recordedAt: Date;
  rating: number | null;
  comment: string | null;
}): ConversationTimelineItemDto {
  const detailParts: string[] = [];
  if (params.rating != null) {
    detailParts.push(`评分 ${params.rating}`);
  }
  if (params.comment?.trim()) {
    detailParts.push(truncateText(params.comment.trim(), 200));
  }
  return {
    id: `feedback_on_conversation:${params.feedbackId}`,
    type: "feedback_on_conversation",
    occurredAt: params.recordedAt.toISOString(),
    title: "你提交了会话反馈",
    detail: detailParts.length > 0 ? detailParts.join(" · ") : undefined,
    meta: {
      sourceId: params.feedbackId,
      rating: params.rating ?? undefined,
    },
  };
}

export { FEEDBACK_SUBJECT_CONVERSATION };

export function compareTimelineItems(
  a: ConversationTimelineItemDto,
  b: ConversationTimelineItemDto,
): number {
  const ta = a.occurredAt.localeCompare(b.occurredAt);
  if (ta !== 0) return ta;
  return a.id.localeCompare(b.id);
}
