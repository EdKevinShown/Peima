import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { SendMessageDto } from "./dto/send-message.dto";

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getConversationWithMessages(conversationId: string, viewerUserId: string) {
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
      conversation.viewerUserId !== viewerUserId &&
      conversation.candidateUserId !== viewerUserId
    ) {
      throw new UnauthorizedException("conversation not accessible by this user");
    }

    return conversation;
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
