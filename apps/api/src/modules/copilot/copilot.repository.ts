import { Injectable } from "@nestjs/common";
import { P2SuggestionStatus } from "@peima/shared/constants";
import { PrismaService } from "../../common/prisma/prisma.service";

const SIGNAL_WINDOW_DAYS = 14;

@Injectable()
export class CopilotRepository {
  constructor(private readonly prisma: PrismaService) {}

  signalWindowStart(): Date {
    return new Date(Date.now() - SIGNAL_WINDOW_DAYS * 86_400_000);
  }

  findFeedbackRatingsForConversation(
    userId: string,
    conversationId: string,
    take: number,
  ): Promise<{ rating: number | null }[]> {
    return this.prisma.userFeedback.findMany({
      where: {
        userId,
        subjectKind: "conversation",
        subjectId: conversationId,
      },
      orderBy: { recordedAt: "desc" },
      take,
      select: { rating: true },
    });
  }

  countUserBehaviorSignalsSince(userId: string, since: Date): Promise<number> {
    return this.prisma.behaviorSignal.count({
      where: {
        userId,
        occurredAt: { gte: since },
      },
    });
  }

  countPendingProfileSuggestions(userId: string): Promise<number> {
    return this.prisma.profileUpdateSuggestion.count({
      where: { userId, status: P2SuggestionStatus.Pending },
    });
  }
}
