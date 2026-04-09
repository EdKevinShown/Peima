/**
 * P5：建议中心数据访问层（Repository）
 */

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type {
  P5SuggestionCenterItem,
  P5SuggestionCenterQueryFilter,
  P5SuggestionCenterStats,
} from "@peima/shared";
import type { ProfileUpdateSuggestion } from "@peima/database";

@Injectable()
export class SuggestionCenterRepository {
  constructor(private prisma: PrismaService) {}

  /**
   * 查询建议列表（支持筛选、分页、排序）
   */
  async findSuggestions(
    filter: P5SuggestionCenterQueryFilter & {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    },
  ): Promise<{ items: P5SuggestionCenterItem[]; total: number }> {
    const {
      status,
      priority: priorityArr,
      category: categoryArr,
      assignedToOperatorId,
      userId,
      createdAfter,
      createdBefore,
      resolvedAfter,
      resolvedBefore,
      page = 1,
      pageSize = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filter;

    const whereClause: any = {};

    if (status) whereClause.status = status;
    if (priorityArr && priorityArr.length > 0) {
      whereClause.priority = { in: priorityArr };
    }
    if (categoryArr && categoryArr.length > 0) {
      whereClause.category = { in: categoryArr };
    }
    if (assignedToOperatorId) whereClause.assignedToOperatorId = assignedToOperatorId;
    if (userId) whereClause.userId = userId;

    if (createdAfter || createdBefore) {
      whereClause.createdAt = {};
      if (createdAfter) whereClause.createdAt.gte = new Date(createdAfter);
      if (createdBefore) whereClause.createdAt.lte = new Date(createdBefore);
    }

    if (resolvedAfter || resolvedBefore) {
      whereClause.resolvedAt = {};
      if (resolvedAfter) whereClause.resolvedAt.gte = new Date(resolvedAfter);
      if (resolvedBefore) whereClause.resolvedAt.lte = new Date(resolvedBefore);
    }

    // 有效排序字段
    const validSortFields = ["createdAt", "updatedAt", "priority"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";

    const [items, total] = await Promise.all([
      this.prisma.profileUpdateSuggestion.findMany({
        where: whereClause,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          [sortField]: sortOrder === "asc" ? "asc" : "desc",
        },
        include: {
          user: {
            select: { id: true, phone: true, nickname: true },
          },
        },
      }),
      this.prisma.profileUpdateSuggestion.count({ where: whereClause }),
    ]);

    // 映射为展现型 DTO
    const mappedItems = items.map((item) => ({
      ...item,
      userPhone: item.user?.phone,
    } as P5SuggestionCenterItem & { user?: any }));

    return { items: mappedItems as P5SuggestionCenterItem[], total };
  }

  /**
   * 获取建议统计信息
   */
  async getStats(
    filter?: Omit<P5SuggestionCenterQueryFilter, "page" | "pageSize">,
  ): Promise<P5SuggestionCenterStats> {
    const whereClause: any = {};

    if (filter?.status) whereClause.status = filter.status;
    if (filter?.priority && filter.priority.length > 0) {
      whereClause.priority = { in: filter.priority };
    }
    if (filter?.category && filter.category.length > 0) {
      whereClause.category = { in: filter.category };
    }
    if (filter?.userId) whereClause.userId = filter.userId;
    if (filter?.assignedToOperatorId) {
      whereClause.assignedToOperatorId = filter.assignedToOperatorId;
    }

    // 获取各状态计数
    const [
      totalCount,
      pendingCount,
      acceptedCount,
      dismissedCount,
      byPriorityData,
      byCategoryData,
    ] = await Promise.all([
      this.prisma.profileUpdateSuggestion.count({ where: whereClause }),
      this.prisma.profileUpdateSuggestion.count({
        where: { ...whereClause, status: "pending" },
      }),
      this.prisma.profileUpdateSuggestion.count({
        where: { ...whereClause, status: "accepted" },
      }),
      this.prisma.profileUpdateSuggestion.count({
        where: { ...whereClause, status: "dismissed" },
      }),

      // 按优先级分组
      this.prisma.profileUpdateSuggestion.groupBy({
        by: ["priority"],
        where: whereClause,
        _count: { id: true },
      }),

      // 按分类分组
      this.prisma.profileUpdateSuggestion.groupBy({
        by: ["category"],
        where: whereClause,
        _count: { id: true },
      }),
    ]);

    const byPriority: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    byPriorityData.forEach((row) => {
      byPriority[row.priority as string] = row._count.id;
    });

    byCategoryData.forEach((row) => {
      byCategory[row.category as string] = row._count.id;
    });

    return {
      totalCount,
      pendingCount,
      acceptedCount,
      dismissedCount,
      byPriority: byPriority as Record<string, number>,
      byCategory: byCategory as Record<string, number>,
      byStatus: {
        pending: pendingCount,
        accepted: acceptedCount,
        dismissed: dismissedCount,
      },
    };
  }

  /**
   * 批量更新建议状态
   */
  async bulkUpdateStatus(
    suggestionIds: string[],
    status: "accepted" | "dismissed",
    operatorId?: string,
  ): Promise<number> {
    const result = await this.prisma.profileUpdateSuggestion.updateMany({
      where: { id: { in: suggestionIds } },
      data: {
        status,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * 更新建议的运营字段
   */
  async updateOperatorFields(
    suggestionId: string,
    updates: {
      priority?: string;
      category?: string;
      operatorNotes?: string;
      assignedToOperatorId?: string;
    },
  ): Promise<ProfileUpdateSuggestion> {
    return this.prisma.profileUpdateSuggestion.update({
      where: { id: suggestionId },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * 导出建议列表（CSV格式的数据）
   */
  async exportSuggestions(
    filter: P5SuggestionCenterQueryFilter,
  ): Promise<Array<Record<string, any>>> {
    const whereClause: any = {};

    if (filter.status) whereClause.status = filter.status;
    if (filter.priority && filter.priority.length > 0) {
      whereClause.priority = { in: filter.priority };
    }
    if (filter.category && filter.category.length > 0) {
      whereClause.category = { in: filter.category };
    }
    if (filter.userId) whereClause.userId = filter.userId;
    if (filter.suggestionIds && filter.suggestionIds.length > 0) {
      whereClause.id = { in: filter.suggestionIds };
    }

    const items = await this.prisma.profileUpdateSuggestion.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, phone: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // 映射为导出格式
    return items.map((item) => ({
      ID: item.id,
      "用户手机": item.user?.phone,
      "用户昵称": item.user?.nickname,
      状态: item.status,
      优先级: item.priority,
      分类: item.category,
      建议内容: JSON.stringify(item.proposedPatch),
      运营备注: item.operatorNotes || "",
      分配运营: item.assignedToOperatorId || "",
      创建时间: item.createdAt.toISOString(),
      更新时间: item.updatedAt.toISOString(),
      解决时间: item.resolvedAt?.toISOString() || "",
    }));
  }

  /**
   * 根据建议ID列表获取相关用户ID
   */
  async getUserIdsBySuggestionIds(suggestionIds: string[]): Promise<string[]> {
    const suggestions = await this.prisma.profileUpdateSuggestion.findMany({
      where: { id: { in: suggestionIds } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return suggestions.map((s) => s.userId);
  }

  /**
   * 查找单条建议
   */
  async findOne(suggestionId: string): Promise<ProfileUpdateSuggestion | null> {
    return this.prisma.profileUpdateSuggestion.findUnique({
      where: { id: suggestionId },
    });
  }

  /**
   * 批量查找建议（用于历史记录前取旧值）
   */
  async findManyByIds(ids: string[]): Promise<ProfileUpdateSuggestion[]> {
    return this.prisma.profileUpdateSuggestion.findMany({
      where: { id: { in: ids } },
    });
  }

  /**
   * 获取建议的历史记录
   */
  async getHistory(suggestionId: string, limit = 50): Promise<any> {
    return this.prisma.suggestionHistory.findMany({
      where: { suggestionId },
      include: {
        changedByUser: {
          select: {
            id: true,
            nickname: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  /**
   * 比较两个版本
   */
  async compareVersions(
    suggestionId: string,
    version1: number,
    version2: number,
  ): Promise<any> {
    const historyRecords = await this.prisma.suggestionHistory.findMany({
      where: {
        suggestionId,
        version: {
          gt: Math.min(version1, version2),
          lte: Math.max(version1, version2),
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const aggregatedChanges: Record<string, any> = {};
    historyRecords.forEach((record) => {
      Object.entries(record.changes as Record<string, any>).forEach(([field, change]: [string, any]) => {
        if (!aggregatedChanges[field]) {
          aggregatedChanges[field] = { old: null, new: null };
        }
        if (change && typeof change === 'object' && 'old' in change) {
          aggregatedChanges[field].old = change.old;
        }
        if (change && typeof change === 'object' && 'new' in change) {
          aggregatedChanges[field].new = change.new;
        }
      });
    });

    return {
      suggestionId,
      fromVersion: Math.min(version1, version2),
      toVersion: Math.max(version1, version2),
      changes: aggregatedChanges,
      historyCount: historyRecords.length,
      records: historyRecords,
    };
  }
}
