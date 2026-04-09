import { IsString, IsArray, IsOptional, IsDateString } from 'class-validator';

export class AssignRoleDto {
  @IsString()
  userId: string;

  @IsArray()
  @IsString({ each: true })
  roles: string[]; // 要分配给用户的角色列表（ADMIN | OPERATOR | DATA_ANALYST | REGULAR_USER）

  @IsOptional()
  @IsString()
  grantedBy?: string; // 谁授予的这个角色

  @IsOptional()
  @IsDateString()
  expiresAt?: string; // 角色过期时间（ISO 8601格式）
}

export class UpdateUserRoleDto {
  @IsArray()
  @IsString({ each: true })
  roles: string[]; // 新的角色列表

  @IsOptional()
  @IsString()
  grantedBy?: string;
}

export class SetRoleExpiryDto {
  @IsString()
  roleCode: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string; // 设置为null可以移除过期时间
}
