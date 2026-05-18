import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import {
  P76_ADMIN_DEFAULT_LIST_LIMIT,
  P76_ADMIN_MAX_LIST_LIMIT,
} from "../p76-admin-allowlist-apply-meta.types";

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === true || value === "true" || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === "0") {
    return false;
  }
  return undefined;
}

export class ListP76AdminAllowlistApplyMetaQueryDto {
  @IsOptional()
  @IsString()
  viewerUserId?: string;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  applied?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  rolledBack?: boolean;

  @IsOptional()
  @IsString()
  sourceVersion?: string;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  violationOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @Min(1)
  @Max(P76_ADMIN_MAX_LIST_LIMIT)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export function toP76AdminListQuery(
  dto: ListP76AdminAllowlistApplyMetaQueryDto,
) {
  return {
    viewerUserId: dto.viewerUserId,
    applied: dto.applied,
    rolledBack: dto.rolledBack,
    sourceVersion: dto.sourceVersion,
    violationOnly: dto.violationOnly,
    limit: dto.limit ?? P76_ADMIN_DEFAULT_LIST_LIMIT,
    cursor: dto.cursor,
  };
}
