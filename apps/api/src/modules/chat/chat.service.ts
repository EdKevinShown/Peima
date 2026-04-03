import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import type { ConversationSummaryResponse } from "./dto/conversation-summary.response";
import { ChatSummaryService } from "./chat-summary.service";

@Injectable()
export class ChatService {
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
          orderBy: { createdAt: "asc" },
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
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation for user ${userId} not found`);
    }

    return conversation;
  }
}
