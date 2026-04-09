/**
 * P5：建议中心业务服务
 */

import { Injectable, ForbiddenException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { SuggestionCenterRepository } from "./suggestion-center.repository";
import { SuggestionHistoryService } from "./suggestion-history.service";
import { RbacService } from "../../common/rbac/rbac.service";
import { AuditService } from "../../common/audit/audit.service";
import { Permission } from "@peima/shared/constants";
import type {
  P5SuggestionCenterListResponse,
  P5SuggestionCenterQueryFilter,
} from "@peima/shared";
import {
  NOTIFICATION_EVENTS,
  SuggestionUpdatedEvent,
} from "../../common/events/notification.events";

@Injectable()
export class SuggestionCenterService {
  constructor(
    private repository: SuggestionCenterRepository,
    private historyService: SuggestionHistoryService,
    private rbacService: RbacService,
    private auditService: AuditService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * 获取建议列表（带权限检查）
   * - 普通用户只能看自己的
   * - 运营/Admin 可以看全部
   */
  async listSuggestions(
    requesterId: string,
    filter: P5SuggestionCenterQueryFilter & {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    },
  ): Promise<P5SuggestionCenterListResponse> {
    // 检查权限
    const canViewAll = await this.rbacService.checkPermission(
      requesterId,
      Permission.VIEW_ALL_SUGGESTIONS,
    );

    // 若无权限看全部，强制看自己的
    const effectiveFilter: typeof filter = {
      ...filter,
      userId: canViewAll ? filter.userId : requesterId,
    };

    const { items, total } = await this.repository.findSuggestions(effectiveFilter);
    const stats = await this.repository.getStats(effectiveFilter);

    const page = filter.page || 1;
    const pageSize = filter.pageSize || 20;

    return {
      items,
      total,
      page,
      pageSize,
      stats,
    };
  }

  /**
   * 获取统计数据
   */
  async getStats(
    requesterId: string,
    filter?: P5SuggestionCenterQueryFilter,
  ) {
    const canViewAll = await this.rbacService.checkPermission(
      requesterId,
      Permission.VIEW_GLOBAL_ANALYTICS,
    );

    if (!canViewAll) {
      // 普通用户/运营：无论是否传 userId，统计范围强制锁定为自己
      return this.repository.getStats({ ...filter, userId: requesterId });
    }

    // 有全局统计权限时：若传了别人的 userId 也直接放行
    return this.repository.getStats(filter);
  }

  /**
   * 批量操作建议（accept/dismiss/assign）
   */
  async bulkOperateSuggestions(
    requesterId: string,
    suggestionIds: string[],
    action: "accept" | "dismiss" | "assign",
    assignedToOperatorId?: string,
    operatorNotes?: string,
  ) {
    try {
      await this.rbacService.requirePermission(
        requesterId,
        Permission.MANAGE_ALL_SUGGESTIONS,
      );

      // 先取旧值（必须在 update 之前，否则 old = new）
      const currentItems = await this.repository.findManyByIds(suggestionIds);
      const currentMap = new Map(currentItems.map((s: any) => [s.id, s]));

      let result = 0;
      if (action === "accept") {
        result = await this.repository.bulkUpdateStatus(suggestionIds, "accepted", requesterId);
      } else if (action === "dismiss") {
        result = await this.repository.bulkUpdateStatus(suggestionIds, "dismissed", requesterId);
      } else if (action === "assign") {
        await Promise.all(
          suggestionIds.map((id) =>
            this.repository.updateOperatorFields(id, {
              assignedToOperatorId,
              operatorNotes,
            }),
          ),
        );
        result = suggestionIds.length;
      }

      // 记录每条建议的版本历史（{ old, new } 格式）
      const changeType = action === "accept" ? "ACCEPT" : action === "dismiss" ? "DISMISS" : "ASSIGN";
      await Promise.allSettled(
        suggestionIds.map((id) => {
          const current: any = currentMap.get(id) ?? {};
          const changes: Record<string, { old: any; new: any }> = {};
          if (action === "accept" || action === "dismiss") {
            changes.status = { old: current.status ?? null, new: action === "accept" ? "accepted" : "dismissed" };
          }
          if (action === "assign") {
            if (assignedToOperatorId !== undefined) {
              changes.assignedToOperatorId = { old: current.assignedToOperatorId ?? null, new: assignedToOperatorId };
            }
            if (operatorNotes !== undefined) {
              changes.operatorNotes = { old: current.operatorNotes ?? null, new: operatorNotes };
            }
          }
          return this.historyService.recordChange(id, changes, requesterId, changeType as any, `Bulk ${action}`);
        }),
      );

      // 获取受影响的用户ID并发送通知
      if (result > 0) {
        const affectedUserIds = await this.repository.getUserIdsBySuggestionIds(suggestionIds);
        this.eventEmitter.emit(
          NOTIFICATION_EVENTS.SUGGESTION_UPDATED,
          new SuggestionUpdatedEvent(suggestionIds, action, requesterId, affectedUserIds),
        );
      }

      await this.auditService.recordAction(requesterId, "SUGGESTION_BULK_OPERATE", "SUGGESTION", {
        newValues: { action, suggestionIds, assignedToOperatorId, count: result },
        changeReason: `Bulk ${action} on ${suggestionIds.length} suggestions`,
        status: "SUCCESS",
      });

      return result;
    } catch (error) {
      await this.auditService.recordAction(requesterId, "SUGGESTION_BULK_OPERATE", "SUGGESTION", {
        newValues: { action, suggestionIds },
        changeReason: `Bulk ${action} on ${suggestionIds.length} suggestions`,
        status: "FAILED",
        errorMessage: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * 更新单条建议的运营字段
   */
  async updateSuggestion(
    requesterId: string,
    suggestionId: string,
    updates: {
      priority?: string;
      category?: string;
      operatorNotes?: string;
      assignedToOperatorId?: string;
    },
  ): Promise<any> {
    try {
      await this.rbacService.requirePermission(
        requesterId,
        Permission.MANAGE_ALL_SUGGESTIONS,
      );

      // 取旧值用于历史 { old, new } 结构
      const current: any = await this.repository.findOne(suggestionId) ?? {};
      const result = await this.repository.updateOperatorFields(suggestionId, updates);

      // 记录版本历史（{ old, new } 格式）
      const historyChanges: Record<string, { old: any; new: any }> = {};
      for (const [field, newVal] of Object.entries(updates)) {
        if (newVal !== undefined) {
          historyChanges[field] = { old: current[field] ?? null, new: newVal };
        }
      }
      await this.historyService.recordChange(
        suggestionId,
        historyChanges,
        requesterId,
        "UPDATE",
        "Operator field update",
      ).catch(() => { /* 历史记录失败不阻断主流程 */ });

      await this.auditService.recordAction(requesterId, "SUGGESTION_UPDATE", "SUGGESTION", {
        entityId: suggestionId,
        newValues: updates,
        changeReason: `Updated suggestion fields`,
        status: "SUCCESS",
      });

      return result;
    } catch (error) {
      await this.auditService.recordAction(requesterId, "SUGGESTION_UPDATE", "SUGGESTION", {
        entityId: suggestionId,
        newValues: updates,
        changeReason: `Updated suggestion fields`,
        status: "FAILED",
        errorMessage: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * 导出建议数据（CSV）
   */
  async exportSuggestions(
    requesterId: string,
    filter: P5SuggestionCenterQueryFilter,
    fields?: string[],
  ): Promise<string> {
    try {
      await this.rbacService.requirePermission(
        requesterId,
        Permission.EXPORT_SUGGESTIONS,
      );

      let items = await this.repository.exportSuggestions(filter);

      // 按 fields 过滤列（前端传来的字段名为英文 key，需映射到中文导出列名）
      if (fields && fields.length > 0) {
        const fieldToColumn: Record<string, string> = {
          id: "ID",
          userId: "用户手机",
          status: "状态",
          priority: "优先级",
          category: "分类",
          proposedPatch: "建议内容",
          createdAt: "创建时间",
          operatorNotes: "运营备注",
          assignedToOperatorId: "分配运营",
        };
        const allowedCols = fields.map((f) => fieldToColumn[f]).filter(Boolean);
        if (allowedCols.length > 0) {
          items = items.map((row) => {
            const filtered: Record<string, any> = {};
            for (const col of allowedCols) {
              filtered[col] = row[col];
            }
            return filtered;
          });
        }
      }

      const csv = this.convertToCSV(items);

      await this.auditService.recordAction(requesterId, "SUGGESTION_EXPORT", "SUGGESTION", {
        newValues: { filter, fields, rowCount: items.length },
        changeReason: `Exported ${items.length} suggestions`,
        status: "SUCCESS",
      });

      return csv;
    } catch (error) {
      await this.auditService.recordAction(requesterId, "SUGGESTION_EXPORT", "SUGGESTION", {
        newValues: { filter, fields },
        changeReason: `Export suggestions failed`,
        status: "FAILED",
        errorMessage: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * 将数组转换为 CSV 字符串
   */
  private convertToCSV(data: Array<Record<string, any>>): string {
    if (data.length === 0) {
      return "";
    }

    const headers = Object.keys(data[0]);
    const csvHeaders = headers.map((h) => `"${h}"`).join(",");

    const csvRows = data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          // 处理特殊字符
          const stringValue =
            typeof value === "string" ? value : JSON.stringify(value);
          return `"${stringValue.replace(/"/g, '""')}"`;
        })
        .join(","),
    );

    return [csvHeaders, ...csvRows].join("\n");
  }

  /**
   * 获取建议的历史版本
   */
  async getSuggestionHistory(requesterId: string, suggestionId: string): Promise<any> {
    // 检查权限
    const suggestion = await this.repository.findOne(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    // 检查用户权限：只能看自己的或有权看全部
    const canViewAll = await this.rbacService.checkPermission(
      requesterId,
      Permission.VIEW_ALL_SUGGESTIONS,
    );
    if (!canViewAll && suggestion.userId !== requesterId) {
      throw new ForbiddenException("Cannot view history for other users");
    }

    // 获取历史记录
    return this.repository.getHistory(suggestionId);
  }

  /**
   * 比较建议的两个版本
   */
  async compareVersions(
    requesterId: string,
    suggestionId: string,
    version1: number,
    version2: number,
  ): Promise<any> {
    // 检查权限
    const suggestion = await this.repository.findOne(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    // 检查用户权限
    const canViewAll = await this.rbacService.checkPermission(
      requesterId,
      Permission.VIEW_ALL_SUGGESTIONS,
    );
    if (!canViewAll && suggestion.userId !== requesterId) {
      throw new ForbiddenException("Cannot view history for other users");
    }

    // 比较版本
    return this.repository.compareVersions(suggestionId, version1, version2);
  }
}

