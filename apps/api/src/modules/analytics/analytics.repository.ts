import { Injectable } from "@nestjs/common";
import { P2SuggestionStatus } from "@peima/shared/constants";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { P2OverviewMineStats, P2OverviewStats } from "./p2-overview.types";

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getP2Overview(): Promise<P2OverviewStats> {
    const [
      totalSummaries,
      totalFeedbacks,
      totalSuggestions,
      pendingSuggestions,
      totalBehaviorSignals,
    ] = await Promise.all([
      this.prisma.conversationSummary.count(),
      this.prisma.userFeedback.count(),
      this.prisma.profileUpdateSuggestion.count(),
      this.prisma.profileUpdateSuggestion.count({
        where: { status: P2SuggestionStatus.Pending },
      }),
      this.prisma.behaviorSignal.count(),
    ]);

    return {
      totalSummaries,
      totalFeedbacks,
      totalSuggestions,
      pendingSuggestions,
      totalBehaviorSignals,
    };
  }

  async getP2OverviewMine(userId: string): Promise<P2OverviewMineStats> {
    const [
      myFeedbackCount,
      mySuggestionCount,
      myPendingSuggestionCount,
      myBehaviorSignalCount,
      myConversationSummaryCount,
    ] = await Promise.all([
      this.prisma.userFeedback.count({ where: { userId } }),
      this.prisma.profileUpdateSuggestion.count({ where: { userId } }),
      this.prisma.profileUpdateSuggestion.count({
        where: { userId, status: P2SuggestionStatus.Pending },
      }),
      this.prisma.behaviorSignal.count({ where: { userId } }),
      this.prisma.conversationSummary.count({
        where: {
          conversation: {
            OR: [
              { viewerUserId: userId },
              { candidateUserId: userId },
            ],
          },
        },
      }),
    ]);

    return {
      myFeedbackCount,
      mySuggestionCount,
      myPendingSuggestionCount,
      myBehaviorSignalCount,
      myConversationSummaryCount,
    };
  }
}
