import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class AdminMyAiRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string) {
    const [conversationSummaries, profileSuggestions, aiSimulationJobs] =
      await Promise.all([
        this.prisma.conversationSummary.findMany({
          where: {
            conversation: {
              OR: [{ viewerUserId: userId }, { candidateUserId: userId }],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            conversationId: true,
            summary: true,
            sourceType: true,
            sourceVersion: true,
            createdAt: true,
            conversation: {
              select: { viewerUserId: true, candidateUserId: true },
            },
          },
        }),
        this.prisma.profileUpdateSuggestion.findMany({
          where: {
            userId,
            OR: [
              { sourceType: { contains: "ai" } },
              { sourceVersion: { contains: "ai" } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            status: true,
            sourceType: true,
            sourceVersion: true,
            sourceConversationId: true,
            createdAt: true,
            updatedAt: true,
            resolvedAt: true,
          },
        }),
        this.prisma.aiSimulationV1Job.findMany({
          where: { viewerUserId: userId },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            poolId: true,
            jobStatus: true,
            schemaVersion: true,
            runSpecVersion: true,
            hintSource: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

    return {
      userId,
      generatedAt: new Date().toISOString(),
      note:
        "当前系统主要持久化 AI 产物快照（如 conversation summary / profile suggestion / ai simulation job）。完整原始 prompt-response 对话默认不落库。",
      conversationSummaries: conversationSummaries.map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        viewerUserId: row.conversation.viewerUserId,
        candidateUserId: row.conversation.candidateUserId,
        sourceType: row.sourceType,
        sourceVersion: row.sourceVersion,
        summaryPreview:
          row.summary.length > 220
            ? `${row.summary.slice(0, 220)}...`
            : row.summary,
        createdAt: row.createdAt,
      })),
      profileSuggestions,
      aiSimulationJobs,
    };
  }
}

