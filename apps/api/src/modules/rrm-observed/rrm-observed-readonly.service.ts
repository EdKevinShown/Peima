import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { buildRrmObservedSignalSummary } from "./rrm-observed.adapter";
import type { RrmObservedReadonlyHttpDto } from "./rrm-observed-readonly.response";
import { RRM_OBSERVED_READONLY_HTTP_SCHEMA_VERSION } from "./rrm-observed-readonly.response";
import { RRM_SOURCE_VERSION_OBSERVED } from "../rrm-shared";

@Injectable()
export class RrmObservedReadonlyService {
  constructor(private readonly prisma: PrismaService) {}

  async getReadonlySummaryForConversation(
    conversationId: string,
    tokenUserId: string,
  ): Promise<RrmObservedReadonlyHttpDto> {
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

    const observed = buildRrmObservedSignalSummary({
      conversationId: cid,
      viewerUserId: uid,
      counterpartyUserId,
      messages: conversation.messages.map((m) => ({
        senderUserId: m.senderUserId,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });

    return {
      schemaVersion: RRM_OBSERVED_READONLY_HTTP_SCHEMA_VERSION,
      sourceVersion: RRM_SOURCE_VERSION_OBSERVED,
      mode: "readonly",
      appliedToMatchResult: false,
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
      conversationId: cid,
      participantUserId: uid,
      counterpartyUserId,
      observed,
    };
  }
}
