import { Injectable } from "@nestjs/common";
import { P2SuggestionStatus } from "@peima/shared/constants";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { P2OverviewMineStats, P2OverviewStats } from "./p2-overview.types";
import type { AdminDashboardStats } from "./admin-dashboard.types";

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

  async getAdminDashboard(): Promise<AdminDashboardStats> {
    const now = new Date();
    const last7d = new Date(now.getTime() - 7 * 86400_000);
    const last30d = new Date(now.getTime() - 30 * 86400_000);
    const last24h = new Date(now.getTime() - 24 * 3600_000);
    const last14d = new Date(now.getTime() - 14 * 86400_000);

    // ---- parallel queries ----
    const [
      totalUsers,
      newLast7,
      newLast30,
      totalBatches,
      totalResults,
      totalConversations,
      totalMessages,
      totalSummaries,
      totalSuggestions,
      suggestionsByStatus,
      suggestionsByCategory,
      suggestionsByPriority,
      totalAuditLogs,
      auditLast24h,
      auditTopActions,
      totalRoleAssignments,
      rolesByCode,
      totalNotifications,
      unreadNotifications,
    ] = await Promise.all([
      // users
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: last7d } } }),
      this.prisma.user.count({ where: { createdAt: { gte: last30d } } }),
      // matching
      this.prisma.matchBatch.count(),
      this.prisma.matchResult.count(),
      // chat
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.conversationSummary.count(),
      // suggestions
      this.prisma.profileUpdateSuggestion.count(),
      this.prisma.profileUpdateSuggestion.groupBy({ by: ["status"], _count: true }),
      this.prisma.profileUpdateSuggestion.groupBy({ by: ["category"], _count: true }),
      this.prisma.profileUpdateSuggestion.groupBy({ by: ["priority"], _count: true }),
      // audit
      this.prisma.auditLog.count(),
      this.prisma.auditLog.count({ where: { createdAt: { gte: last24h } } }),
      this.prisma.auditLog.groupBy({
        by: ["action"],
        _count: true,
        orderBy: { _count: { action: "desc" } },
        take: 10,
      }),
      // rbac
      this.prisma.userRole.count(),
      this.prisma.userRole.groupBy({ by: ["roleCode"], _count: true }),
      // notifications
      this.prisma.notification.count(),
      this.prisma.notification.count({ where: { read: false } }),
    ]);

    // ---- user growth trend (last 14 days) ----
    const toISO = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);

    const userGrowthRaw: { date: Date; count: bigint }[] =
      await this.prisma.$queryRaw`
        SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
        FROM users
        WHERE "createdAt" >= ${last14d}
        GROUP BY DATE("createdAt")
        ORDER BY date
      `;
    const userGrowthTrend = userGrowthRaw.map((r) => ({
      date: toISO(r.date),
      count: Number(r.count),
    }));

    // ---- suggestion trend (last 14 days) ----
    const sugCreatedRaw: { date: Date; count: bigint }[] =
      await this.prisma.$queryRaw`
        SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
        FROM profile_update_suggestions
        WHERE "createdAt" >= ${last14d}
        GROUP BY DATE("createdAt")
        ORDER BY date
      `;
    const sugResolvedRaw: { date: Date; count: bigint }[] =
      await this.prisma.$queryRaw`
        SELECT DATE("resolvedAt") as date, COUNT(*)::bigint as count
        FROM profile_update_suggestions
        WHERE "resolvedAt" IS NOT NULL AND "resolvedAt" >= ${last14d}
        GROUP BY DATE("resolvedAt")
        ORDER BY date
      `;
    const createdMap = Object.fromEntries(sugCreatedRaw.map((r) => [toISO(r.date), Number(r.count)]));
    const resolvedMap = Object.fromEntries(sugResolvedRaw.map((r) => [toISO(r.date), Number(r.count)]));
    const allDates = new Set([...Object.keys(createdMap), ...Object.keys(resolvedMap)]);
    const suggestionTrend = [...allDates].sort().map((date) => ({
      date,
      created: createdMap[date] || 0,
      resolved: resolvedMap[date] || 0,
    }));

    return {
      users: { total: totalUsers, newLast7Days: newLast7, newLast30Days: newLast30 },
      matching: {
        totalBatches,
        totalResults,
        avgResultsPerBatch: totalBatches > 0 ? Math.round(totalResults / totalBatches) : 0,
      },
      chat: { totalConversations, totalMessages, totalSummaries },
      suggestions: {
        total: totalSuggestions,
        byStatus: Object.fromEntries(suggestionsByStatus.map((s) => [s.status, s._count])),
        byCategory: Object.fromEntries(suggestionsByCategory.map((s) => [s.category, s._count])),
        byPriority: Object.fromEntries(suggestionsByPriority.map((s) => [s.priority, s._count])),
      },
      audit: {
        totalLogs: totalAuditLogs,
        last24hCount: auditLast24h,
        topActions: auditTopActions.map((a) => ({ action: a.action, count: a._count })),
      },
      rbac: {
        totalRoleAssignments,
        byRole: Object.fromEntries(rolesByCode.map((r) => [r.roleCode, r._count])),
      },
      notifications: { total: totalNotifications, unread: unreadNotifications },
      userGrowthTrend,
      suggestionTrend,
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
