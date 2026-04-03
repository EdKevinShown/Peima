import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  P1_DISCLAIMER,
  P1_HINT_PREFIX,
  P1_MARK,
} from "@peima/shared/constants";
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

  async getConversationSummaryPlaceholder(
    conversationId: string,
    tokenUserId: string,
  ): Promise<{ summary: string; chatStageHint: string; generatedAt: string }> {
    const conversation = await this.loadConversationForParticipant(
      conversationId,
      tokenUserId,
    );

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

    return {
      summary,
      chatStageHint,
      generatedAt: new Date().toISOString(),
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
