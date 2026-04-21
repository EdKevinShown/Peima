import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import type { ConversationSummaryResponse } from "./dto/conversation-summary.response";
import type {
  ConversationTimelineItemDto,
  ConversationTimelineResponseDto,
} from "./dto/conversation-timeline.response";
import {
  compareTimelineItems,
  FEEDBACK_SUBJECT_CONVERSATION,
  mapBehaviorSignal,
  mapConversationOpened,
  mapFeedbackOnConversation,
  mapMessage,
  mapSummarySnapshot,
} from "./chat-timeline.mapper";
import { ChatSummaryService } from "./chat-summary.service";

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatSummaryService: ChatSummaryService,
  ) {}

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return user;
  }

  async createOrReuseConversation(userId: string) {
    await this.ensureUserExists(userId);

    // Latest MatchResult where this user is the viewer.
    const latest = await this.prisma.matchResult.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, candidateUserId: true },
    });

    if (!latest) {
      throw new NotFoundException(`No match result for user ${userId}`);
    }

    const existing = await this.prisma.conversation.findFirst({
      where: {
        viewerUserId: userId,
        candidateUserId: latest.candidateUserId,
        status: "active",
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      // Reuse: update matchResultId to latest.
      return this.prisma.conversation.update({
        where: { id: existing.id },
        data: {
          matchResultId: latest.id,
          status: "active",
        },
      });
    }

    return this.prisma.conversation.create({
      data: {
        viewerUserId: userId,
        candidateUserId: latest.candidateUserId,
        matchResultId: latest.id,
        status: "active",
      },
    });
  }

  private async loadConversationForParticipant(
    conversationId: string,
    tokenUserId: string,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (
      conversation.viewerUserId !== tokenUserId &&
      conversation.candidateUserId !== tokenUserId
    ) {
      throw new UnauthorizedException("conversation not accessible by this user");
    }

    return conversation;
  }

  async getConversationWithMessages(conversationId: string, viewerUserId: string) {
    return this.loadConversationForParticipant(conversationId, viewerUserId);
  }

  /**
   * GET summary: latest persisted row if any, else same P1 rule-based text as before (not stored).
   */
  async getConversationSummaryPlaceholder(
    conversationId: string,
    tokenUserId: string,
  ): Promise<ConversationSummaryResponse> {
    return this.chatSummaryService.getSummary(conversationId, tokenUserId);
  }

  /** POST generate: rule-based snapshot written to `conversation_summaries`. */
  async generateConversationSummaryPersisted(
    conversationId: string,
    tokenUserId: string,
  ): Promise<ConversationSummaryResponse> {
    return this.chatSummaryService.generateAndPersist(
      conversationId,
      tokenUserId,
    );
  }

  /**
   * Read-only relationship timeline for one conversation (P3-C).
   * Feedback entries: only the current user's feedback on this conversation.
   * P3-3: optional messageSkip/messageLimit — skip>0 returns message_sent items only.
   */
  async getRelationshipTimeline(
    conversationId: string,
    tokenUserId: string,
    opts: { messageSkip: number; messageLimit: number },
  ): Promise<ConversationTimelineResponseDto> {
    const { messageSkip, messageLimit } = opts;

    const shell = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        viewerUserId: true,
        candidateUserId: true,
        createdAt: true,
      },
    });

    if (!shell) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (
      shell.viewerUserId !== tokenUserId &&
      shell.candidateUserId !== tokenUserId
    ) {
      throw new UnauthorizedException(
        "conversation not accessible by this user",
      );
    }

    const messageSelect = {
      id: true,
      senderUserId: true,
      content: true,
      createdAt: true,
    } as const;

    if (messageSkip > 0) {
      const takeFetch = messageLimit + 1;
      const rows = await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        skip: messageSkip,
        take: takeFetch,
        select: messageSelect,
      });
      const hasMore = rows.length > messageLimit;
      const slice = hasMore ? rows.slice(0, messageLimit) : rows;
      const items: ConversationTimelineItemDto[] = slice.map((m) =>
        mapMessage({
          messageId: m.id,
          senderUserId: m.senderUserId,
          tokenUserId,
          content: m.content,
          createdAt: m.createdAt,
        }),
      );
      return {
        conversationId,
        generatedAt: new Date().toISOString(),
        items,
        messagePagination: {
          skip: messageSkip,
          limit: messageLimit,
          hasMore,
        },
      };
    }

    const participantIds = [shell.viewerUserId, shell.candidateUserId];

    const takeFetch = messageLimit + 1;
    const messageRows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: takeFetch,
      select: messageSelect,
    });
    const hasMoreMessages = messageRows.length > messageLimit;
    const messages = hasMoreMessages
      ? messageRows.slice(0, messageLimit)
      : messageRows;

    const p2Agg = await Promise.allSettled([
      this.prisma.conversationSummary.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          summary: true,
          createdAt: true,
        },
      }),
      this.prisma.behaviorSignal.findMany({
        where: {
          conversationId,
          userId: { in: participantIds },
        },
        orderBy: { occurredAt: "asc" },
        select: {
          id: true,
          userId: true,
          eventType: true,
          occurredAt: true,
          properties: true,
        },
      }),
      this.prisma.userFeedback.findMany({
        where: {
          userId: tokenUserId,
          subjectKind: FEEDBACK_SUBJECT_CONVERSATION,
          subjectId: conversationId,
        },
        orderBy: { recordedAt: "asc" },
        select: {
          id: true,
          recordedAt: true,
          rating: true,
          comment: true,
        },
      }),
    ]);

    const summaries =
      p2Agg[0].status === "fulfilled"
        ? p2Agg[0].value
        : [];
    const signals =
      p2Agg[1].status === "fulfilled" ? p2Agg[1].value : [];
    const feedbacks =
      p2Agg[2].status === "fulfilled" ? p2Agg[2].value : [];

    p2Agg.forEach((r, i) => {
      if (r.status === "rejected") {
        this.logger.warn(
          `Timeline P2 query ${i} failed (conversationId=${conversationId}): ${String(r.reason)}`,
        );
      }
    });

    const items: ConversationTimelineItemDto[] = [];

    items.push(
      mapConversationOpened({
        conversationId: shell.id,
        createdAt: shell.createdAt,
      }),
    );

    for (const m of messages) {
      items.push(
        mapMessage({
          messageId: m.id,
          senderUserId: m.senderUserId,
          tokenUserId,
          content: m.content,
          createdAt: m.createdAt,
        }),
      );
    }

    for (const row of summaries) {
      items.push(
        mapSummarySnapshot({
          summaryId: row.id,
          createdAt: row.createdAt,
          summary: row.summary,
        }),
      );
    }

    for (const s of signals) {
      items.push(
        mapBehaviorSignal({
          signalId: s.id,
          userId: s.userId,
          eventType: s.eventType,
          occurredAt: s.occurredAt,
          properties: s.properties,
        }),
      );
    }

    for (const f of feedbacks) {
      items.push(
        mapFeedbackOnConversation({
          feedbackId: f.id,
          recordedAt: f.recordedAt,
          rating: f.rating,
          comment: f.comment,
        }),
      );
    }

    items.sort(compareTimelineItems);

    return {
      conversationId,
      generatedAt: new Date().toISOString(),
      items,
      messagePagination: {
        skip: 0,
        limit: messageLimit,
        hasMore: hasMoreMessages,
      },
    };
  }

  private isSenderInConversation(conversation: {
    viewerUserId: string;
    candidateUserId: string;
  }, senderUserId: string): boolean {
    return senderUserId === conversation.viewerUserId || senderUserId === conversation.candidateUserId;
  }

  async sendMessage(dto: SendMessageDto) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${dto.conversationId} not found`);
    }

    if (!this.isSenderInConversation(conversation, dto.senderUserId)) {
      throw new BadRequestException(
        "senderUserId must be one of the conversation participants",
      );
    }

    return this.prisma.message.create({
      data: {
        conversationId: dto.conversationId,
        senderUserId: dto.senderUserId,
        content: dto.content,
      },
    });
  }

  async getLatestConversationForUser(userId: string) {
    await this.ensureUserExists(userId);

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        OR: [{ viewerUserId: userId }, { candidateUserId: userId }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation for user ${userId} not found`);
    }

    return conversation;
  }
}
