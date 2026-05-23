import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { buildRrmTimelineSignalSummary } from "./rrm-timeline.adapter";
import type { RrmTimelineReadonlyHttpDto } from "./rrm-timeline-readonly.response";
import { toRrmTimelineReadonlyHttpDto } from "./rrm-timeline-readonly.response";

@Injectable()
export class RrmTimelineReadonlyService {
  constructor(private readonly prisma: PrismaService) {}

  async getReadonlySummaryForConversation(
    conversationId: string,
    tokenUserId: string,
  ): Promise<RrmTimelineReadonlyHttpDto> {
    const cid = conversationId.trim();
    const uid = tokenUserId.trim();
    if (!cid || !uid) {
      throw new NotFoundException("conversation not found");
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: cid },
      include: {
        messages: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            senderUserId: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${cid} not found`);
    }

    if (
      conversation.viewerUserId !== uid &&
      conversation.candidateUserId !== uid
    ) {
      throw new UnauthorizedException("conversation not accessible by this user");
    }

    const counterpartyUserId =
      uid === conversation.viewerUserId
        ? conversation.candidateUserId
        : conversation.viewerUserId;

    const summary = buildRrmTimelineSignalSummary({
      conversationId: cid,
      viewerUserId: uid,
      counterpartyUserId,
      messages: conversation.messages.map((m) => ({
        senderUserId: m.senderUserId,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });

    return toRrmTimelineReadonlyHttpDto({
      conversationId: cid,
      participantUserId: uid,
      summary,
    });
  }
}
