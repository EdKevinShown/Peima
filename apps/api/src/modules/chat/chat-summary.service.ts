import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  P1_DISCLAIMER,
  P1_HINT_PREFIX,
  P1_MARK,
  P2SourceType,
} from "@peima/shared/constants";
import type { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ConversationSummaryResponse } from "./dto/conversation-summary.response";
import { ChatSummaryRepository } from "./chat-summary.repository";

type ConversationWithMessages = Prisma.ConversationGetPayload<{
  include: { messages: true };
}>;

@Injectable()
export class ChatSummaryService {
  /** Persisted rows: rule-based snapshot version (bump when template text changes). */
  static readonly RULE_SUMMARY_VERSION = "p2-chat-rule-v1";
  /** Inline GET fallback: same rules, not stored. */
  static readonly INLINE_SUMMARY_VERSION = "p2-chat-inline-v1";

  constructor(
    private readonly prisma: PrismaService,
    private readonly summaryRepo: ChatSummaryRepository,
  ) {}

  private assertParticipant(
    conversation: {
      viewerUserId: string;
      candidateUserId: string;
    },
    tokenUserId: string,
  ) {
    if (
      conversation.viewerUserId !== tokenUserId &&
      conversation.candidateUserId !== tokenUserId
    ) {
      throw new UnauthorizedException(
        "conversation not accessible by this user",
      );
    }
  }

  private async loadConversationForParticipant(
    conversationId: string,
    tokenUserId: string,
  ): Promise<ConversationWithMessages> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    this.assertParticipant(conversation, tokenUserId);

    return conversation;
  }

  /**
   * P1 rule/template placeholder summary (no LLM). Shared by GET fallback and POST generate.
   */
  computeRuleBasedSummary(conversation: ConversationWithMessages): {
    summary: string;
    chatStageHint: string;
  } {
    const messages = conversation.messages;
    const n = messages.length;
    const vId = conversation.viewerUserId;
    const cId = conversation.candidateUserId;

    let viewerCount = 0;
    let candidateCount = 0;
    for (const m of messages) {
      if (m.senderUserId === vId) viewerCount++;
      else if (m.senderUserId === cId) candidateCount++;
    }

    let summary: string;
    let chatStageHint: string;

    const hint = (body: string) =>
      `${P1_HINT_PREFIX}${P1_MARK}：${body}`;

    if (n === 0) {
      summary = `会话尚无消息。有对话后将根据条数与双方参与度生成摘要。${P1_DISCLAIMER}`;
      chatStageHint = hint(
        "冷启动。可先发一条简短自我介绍或轻松话题。",
      );
    } else if (candidateCount === 0) {
      summary = `当前共 ${n} 条消息，均为 viewer 侧发送。${P1_DISCLAIMER}`;
      chatStageHint = hint("等待对方回复。避免连续长消息轰炸。");
    } else if (viewerCount === 0) {
      summary = `当前共 ${n} 条消息，均为 candidate 侧发送。${P1_DISCLAIMER}`;
      chatStageHint = hint("建议 viewer 侧适时回复，保持互动平衡。");
    } else {
      summary = `当前共 ${n} 条消息：viewer ${viewerCount} 条，candidate ${candidateCount} 条。${P1_DISCLAIMER}`;
      chatStageHint = hint(
        "已有来有回，可逐步加深话题或约定下一步。",
      );
    }

    return { summary, chatStageHint };
  }

  async getSummary(
    conversationId: string,
    tokenUserId: string,
  ): Promise<ConversationSummaryResponse> {
    const cid = conversationId.trim();

    const row = await this.summaryRepo.findLatestByConversationId(cid);

    if (row) {
      const shell = await this.prisma.conversation.findUnique({
        where: { id: cid },
        select: { viewerUserId: true, candidateUserId: true },
      });
      if (!shell) {
        throw new NotFoundException(`Conversation ${cid} not found`);
      }
      this.assertParticipant(shell, tokenUserId);
      return {
        summary: row.summary,
        chatStageHint: row.chatStageHint ?? "",
        generatedAt: row.createdAt.toISOString(),
        sourceType: row.sourceType,
        sourceVersion: row.sourceVersion,
        persisted: true,
      };
    }

    const conversation = await this.loadConversationForParticipant(
      cid,
      tokenUserId,
    );

    const computed = this.computeRuleBasedSummary(conversation);
    return {
      ...computed,
      generatedAt: new Date().toISOString(),
      sourceType: P2SourceType.RuleBased,
      sourceVersion: ChatSummaryService.INLINE_SUMMARY_VERSION,
      persisted: false,
    };
  }

  async generateAndPersist(
    conversationId: string,
    tokenUserId: string,
  ): Promise<ConversationSummaryResponse> {
    const cid = conversationId.trim();

    const conversation = await this.loadConversationForParticipant(
      cid,
      tokenUserId,
    );
    const latestPersisted =
      await this.summaryRepo.findLatestByConversationId(cid);
    const latestMessageCreatedAt =
      conversation.messages[conversation.messages.length - 1]?.createdAt ?? null;

    const canReuseLatest =
      latestPersisted !== null &&
      latestPersisted.sourceType === P2SourceType.RuleBased &&
      latestPersisted.sourceVersion ===
        ChatSummaryService.RULE_SUMMARY_VERSION &&
      (latestMessageCreatedAt === null ||
        latestPersisted.createdAt >= latestMessageCreatedAt);

    if (canReuseLatest) {
      return {
        summary: latestPersisted.summary,
        chatStageHint: latestPersisted.chatStageHint ?? "",
        generatedAt: latestPersisted.createdAt.toISOString(),
        sourceType: latestPersisted.sourceType,
        sourceVersion: latestPersisted.sourceVersion,
        persisted: true,
      };
    }

    const computed = this.computeRuleBasedSummary(conversation);

    const row = await this.summaryRepo.create({
      conversationId: cid,
      summary: computed.summary,
      chatStageHint: computed.chatStageHint,
      sourceType: P2SourceType.RuleBased,
      sourceVersion: ChatSummaryService.RULE_SUMMARY_VERSION,
    });

    return {
      summary: row.summary,
      chatStageHint: row.chatStageHint ?? "",
      generatedAt: row.createdAt.toISOString(),
      sourceType: row.sourceType,
      sourceVersion: row.sourceVersion,
      persisted: true,
    };
  }
}
