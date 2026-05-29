import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import {
  P76_CANONICAL_SIDECAR_ADMIN_DEFAULT_LIST_LIMIT,
  P76_CANONICAL_SIDECAR_ADMIN_MAX_LIST_LIMIT,
} from "../p76-canonical-sidecar-admin.types";

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

export class ListP76CanonicalSidecarAdminQueryDto {
  @IsOptional()
  @IsString()
  auditRunId?: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsString()
  viewerUserId?: string;

  @IsOptional()
  @IsString()
  matchResultId?: string;

  @IsOptional()
  @IsString()
  selectedCandidateId?: string;

  @IsOptional()
  @IsString()
  sourceVersion?: string;

  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  promotionStatus?: string;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  appliedToMatchResult?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  appliedToFinalScore?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  appliedToWorkerRanking?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  rolledBack?: boolean;

  @IsOptional()
  @IsString()
  generatedAtFrom?: string;

  @IsOptional()
  @IsString()
  generatedAtTo?: string;

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
  @Max(P76_CANONICAL_SIDECAR_ADMIN_MAX_LIST_LIMIT)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export function toP76CanonicalSidecarAdminListQuery(
  dto: ListP76CanonicalSidecarAdminQueryDto,
  options?: { appliedToMatchResultDefault?: boolean },
) {
  return {
    auditRunId: dto.auditRunId,
    environment: dto.environment,
    viewerUserId: dto.viewerUserId,
    matchResultId: dto.matchResultId,
    selectedCandidateId: dto.selectedCandidateId,
    sourceVersion: dto.sourceVersion,
    mode: dto.mode,
    promotionStatus: dto.promotionStatus,
    appliedToMatchResult:
      dto.appliedToMatchResult ??
      options?.appliedToMatchResultDefault ??
      false,
    appliedToFinalScore: dto.appliedToFinalScore,
    appliedToWorkerRanking: dto.appliedToWorkerRanking,
    rolledBack: dto.rolledBack,
    generatedAtFrom: dto.generatedAtFrom,
    generatedAtTo: dto.generatedAtTo,
    activeOnly: dto.activeOnly ?? true,
    includeDeleted: dto.includeDeleted ?? false,
    limit: dto.limit ?? P76_CANONICAL_SIDECAR_ADMIN_DEFAULT_LIST_LIMIT,
    cursor: dto.cursor,
  };
}
