/**
 * GET /chat/conversations/:conversationId/timeline — read-only aggregate.
 */

export type ConversationTimelineEventType =
  | "conversation_opened"
  | "message_sent"
  | "summary_snapshot"
  | "behavior_signal"
  | "feedback_on_conversation";

export type ConversationTimelineItemMeta = {
  sourceId?: string;
  actorUserId?: string;
  rating?: number;
};

export class ConversationTimelineItemDto {
  id!: string;
  type!: ConversationTimelineEventType;
  occurredAt!: string;
  title!: string;
  detail?: string;
  meta?: ConversationTimelineItemMeta;
}

/** P3-3: message slice pagination (optional on legacy clients; always set by current API). */
export class ConversationTimelineMessagePaginationDto {
  skip!: number;
  limit!: number;
  hasMore!: boolean;
}

export class ConversationTimelineResponseDto {
  conversationId!: string;
  generatedAt!: string;
  items!: ConversationTimelineItemDto[];
  messagePagination?: ConversationTimelineMessagePaginationDto;
}
