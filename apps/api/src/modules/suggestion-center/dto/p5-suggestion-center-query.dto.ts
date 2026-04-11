/**
 * P5：建议中心查询 DTO
 */

import { IsOptional, IsString, IsArray, IsDateString } from "class-validator";
import { Transform } from "class-transformer";
import type { P5SuggestionPriorityId, P5SuggestionCategoryId } from "@peima/shared/constants";

// Query string 单值自动转数组
const ToArray = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Array.isArray(value) ? value : [value];
  });

export class P5SuggestionCenterQueryDto {
  @IsOptional()
  @IsString()
  status?: "pending" | "accepted" | "dismissed";

  @IsOptional()
  @ToArray()
  @IsArray()
  priority?: P5SuggestionPriorityId[];

  @IsOptional()
  @ToArray()
  @IsArray()
  category?: P5SuggestionCategoryId[];

  @IsOptional()
  @IsString()
  assignedToOperatorId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsDateString()
  createdAfter?: string;

  @IsOptional()
  @IsDateString()
  createdBefore?: string;

  @IsOptional()
  @IsDateString()
  resolvedAfter?: string;

  @IsOptional()
  @IsDateString()
  resolvedBefore?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;

  // 排序字段：priority | createdAt | updatedAt | status
  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: "asc" | "desc";
}

/**
 * P5：建议中心批量操作 DTO
 */
export class P5SuggestionBulkOperationDto {
  @IsArray()
  @IsString({ each: true })
  suggestionIds: string[];

  @IsString()
  action: "accept" | "dismiss" | "assign"; // 根据权限限制可用操作

  @IsOptional()
  @IsString()
  assignToOperatorId?: string;

  @IsOptional()
  @IsString()
  operatorNotes?: string;
}

/**
 * P5：建议导出 DTO
 */
export class P5SuggestionExportDto {
  /** filtered | selected | all */
  @IsOptional()
  @IsString()
  type?: string;

  /** 导出字段列表 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fields?: string[];

  /** 筛选条件 */
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @ToArray()
  @IsArray()
  priority?: P5SuggestionPriorityId[];

  @IsOptional()
  @ToArray()
  @IsArray()
  category?: P5SuggestionCategoryId[];

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestionIds?: string[];

  /** 前端分页/排序字段（导出时忽略，但允许传入避免 400） */
  @IsOptional()
  page?: any;

  @IsOptional()
  pageSize?: any;

  @IsOptional()
  sortBy?: any;

  @IsOptional()
  sortOrder?: any;
}

/**
 * P5：建议中心更新操作 DTO
 */
export class P5SuggestionUpdateDto {
  @IsOptional()
  @IsString()
  priority?: P5SuggestionPriorityId;

  @IsOptional()
  @IsString()
  category?: P5SuggestionCategoryId;

  @IsOptional()
  @IsString()
  operatorNotes?: string;

  @IsOptional()
  @IsString()
  assignToOperatorId?: string;
}
