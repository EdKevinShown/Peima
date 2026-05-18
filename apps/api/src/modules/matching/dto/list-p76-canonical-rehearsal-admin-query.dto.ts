import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import {
  P76_REHEARSAL_ADMIN_DEFAULT_LIST_LIMIT,
  P76_REHEARSAL_ADMIN_MAX_LIST_LIMIT,
} from "../p76-canonical-rehearsal-admin.types";

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

export class ListP76CanonicalRehearsalAdminQueryDto {
  @IsOptional()
  @IsString()
  auditRunId?: string;

  @IsOptional()
  @IsString()
  sourceVersion?: string;

  @IsOptional()
  @IsString()
  readPathSourceVersion?: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  eligible?: boolean;

  @IsOptional()
  @IsString()
  guardrailReason?: string;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  wouldChangeCandidate?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  appliedToMatchResult?: boolean;

  @IsOptional()
  @IsString()
  generatedAtFrom?: string;

  @IsOptional()
  @IsString()
  generatedAtTo?: string;

  @IsOptional()
  @IsString()
  viewerUserId?: string;

  @IsOptional()
  @IsString()
  matchResultId?: string;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  activeOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  includeDeleted?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @Min(1)
  @Max(P76_REHEARSAL_ADMIN_MAX_LIST_LIMIT)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export function toP76RehearsalAdminListQuery(
  dto: ListP76CanonicalRehearsalAdminQueryDto,
) {
  return {
    auditRunId: dto.auditRunId,
    sourceVersion: dto.sourceVersion,
    readPathSourceVersion: dto.readPathSourceVersion,
    environment: dto.environment,
    eligible: dto.eligible,
    guardrailReason: dto.guardrailReason,
    wouldChangeCandidate: dto.wouldChangeCandidate,
    appliedToMatchResult: dto.appliedToMatchResult,
    generatedAtFrom: dto.generatedAtFrom,
    generatedAtTo: dto.generatedAtTo,
    viewerUserId: dto.viewerUserId,
    matchResultId: dto.matchResultId,
    activeOnly: dto.activeOnly ?? true,
    includeDeleted: dto.includeDeleted ?? false,
    limit: dto.limit ?? P76_REHEARSAL_ADMIN_DEFAULT_LIST_LIMIT,
    cursor: dto.cursor,
  };
}
