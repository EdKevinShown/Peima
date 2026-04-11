/**
 * P5：建议历史版本服务
 * 提供版本应用和历史记录查询
 */

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class SuggestionHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录建议的变更历史
   */
  async recordChange(
    suggestionId: string,
    changes: Record<string, any>,
    changedByUserId: string,
    changeType: "UPDATE" | "ACCEPT" | "DISMISS" | "ASSIGN" = "UPDATE",
    changeReason?: string,
  ): Promise<any> {
    // 获取当前建议版本号
    const suggestion = await this.prisma.profileUpdateSuggestion.findUnique({
      where: { id: suggestionId },
      select: { versionNumber: true },
    });

    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    // 计算变更字段
    const changedFields = Object.keys(changes).filter(
      (field) => changes[field] !== undefined,
    );

    // 创建历史记录
    const history = await this.prisma.suggestionHistory.create({
      data: {
        suggestionId,
        version: suggestion.versionNumber + 1,
        previousVersion: suggestion.versionNumber,
        changes,
        changedFields,
        changedByUserId,
        changeType,
        changeReason,
      },
    });

    // 更新建议的版本号
    await this.prisma.profileUpdateSuggestion.update({
      where: { id: suggestionId },
      data: { versionNumber: suggestion.versionNumber + 1 },
    });

    return history;
  }

  /**
   * 获取建议的历史记录
   */
  async getSuggestionHistory(suggestionId: string, limit = 20): Promise<any> {
    const history = await this.prisma.suggestionHistory.findMany({
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
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return history.reverse(); // 返回按时间正序排列
  }

  /**
   * 比较两个版本
   */
  async compareVersions(
    suggestionId: string,
    version1: number,
    version2: number,
  ): Promise<any> {
    const suggestion = await this.prisma.profileUpdateSuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    // 获取两个版本之间的所有变更
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

    // 聚合变更
    const aggregatedChanges: Record<string, any> = {};
    historyRecords.forEach((record) => {
      Object.entries(record.changes as Record<string, any>).forEach(([field, change]: [string, any]) => {
        if (!aggregatedChanges[field]) {
          aggregatedChanges[field] = { old: null, new: null };
        }
        if (change?.old !== undefined) {
          aggregatedChanges[field].old = change.old;
        }
        if (change?.new !== undefined) {
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

  /**
   * 获取建议的初始版本（快照）
   */
  async getVersionSnapshot(suggestionId: string, version: number) {
    const suggestion = await this.prisma.profileUpdateSuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    // 从第一版本开始，应用所有到指定版本的变更
    const historyRecords = await this.prisma.suggestionHistory.findMany({
      where: {
        suggestionId,
        version: { lte: version },
      },
      orderBy: { createdAt: "asc" },
    });

    // 从当前建议构建快照
    let snapshot: any = {
      id: suggestion.id,
      userId: suggestion.userId,
      status: suggestion.status,
      priority: suggestion.priority,
      category: suggestion.category,
      proposedPatch: suggestion.proposedPatch,
      createdAt: suggestion.createdAt,
      updatedAt: suggestion.updatedAt,
      versionNumber: version,
    };

    // 反向应用变更以获得快照版本（从最新版本回到目标版本）
    const allHistory = await this.prisma.suggestionHistory.findMany({
      where: { suggestionId },
      orderBy: { createdAt: "desc" },
    });

    allHistory.forEach((record) => {
      if (record.version > version) {
        // 撤销这个变更
        Object.entries(record.changes as Record<string, any>).forEach(([field, change]: [string, any]) => {
          if (change.old !== undefined) {
            snapshot[field] = change.old;
          }
        });
      }
    });

    return snapshot;
  }
}
