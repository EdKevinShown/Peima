/** P5 Phase 2.4: Admin Dashboard analytics types */

export type AdminDashboardStats = {
  /** 用户概览 */
  users: {
    total: number;
    newLast7Days: number;
    newLast30Days: number;
  };

  /** 匹配概览 */
  matching: {
    totalBatches: number;
    totalResults: number;
    avgResultsPerBatch: number;
  };

  /** 聊天概览 */
  chat: {
    totalConversations: number;
    totalMessages: number;
    totalSummaries: number;
  };

  /** 建议治理 */
  suggestions: {
    total: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
  };

  /** 审计日志 */
  audit: {
    totalLogs: number;
    last24hCount: number;
    topActions: { action: string; count: number }[];
  };

  /** RBAC */
  rbac: {
    totalRoleAssignments: number;
    byRole: Record<string, number>;
  };

  /** 通知 */
  notifications: {
    total: number;
    unread: number;
  };

  /** 用户增长趋势 (最近14天) */
  userGrowthTrend: { date: string; count: number }[];

  /** 建议处理趋势 (最近14天) */
  suggestionTrend: { date: string; created: number; resolved: number }[];
};
