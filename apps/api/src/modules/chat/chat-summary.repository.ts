import { Injectable } from "@nestjs/common";
import type { ConversationSummary } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class ChatSummaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findLatestByConversationId(
    conversationId: string,
  ): Promise<ConversationSummary | null> {
    const id = conversationId.trim();
    if (!id) {
      return Promise.resolve(null);
    }
    // findMany + take:1 avoids edge cases with findFirst+orderBy on some drivers; id tie-break for same createdAt
    return this.prisma.conversationSummary
      .findMany({
        where: { conversationId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
      })
      .then((rows) => rows[0] ?? null);
  }

  create(data: {
    conversationId: string;
    summary: string;
    chatStageHint: string | null;
    sourceType: string;
    sourceVersion: string;
  }): Promise<ConversationSummary> {
    return this.prisma.conversationSummary.create({
      data: {
        ...data,
        conversationId: data.conversationId.trim(),
      },
    });
  }
}
