import { IsString, IsOptional, IsObject, IsNumber } from 'class-validator';

export class CreateAuditLogDto {
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsObject()
  oldValues?: Record<string, any>;

  @IsOptional()
  @IsObject()
  newValues?: Record<string, any>;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  changeReason?: string;

  @IsOptional()
  @IsString()
  status?: string = 'SUCCESS';

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsNumber()
  duration?: number;
}
