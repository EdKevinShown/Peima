import { Type } from "class-transformer";
import {
  IsBoolean,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import type {
  P76CanonicalAdminApplyBodyV1,
  P76CanonicalAdminMutationGateContextBodyV1,
  P76CanonicalAdminRollbackBodyV1,
} from "../p76-canonical-admin-mutation.types";

export class P76CanonicalAdminMutationGateContextDto {
  @IsBoolean()
  gate12Final!: boolean;

  @IsBoolean()
  grafanaReady!: boolean;

  @IsBoolean()
  pmSignoff!: boolean;

  @IsBoolean()
  opsSignoff!: boolean;

  @IsBoolean()
  engSignoff!: boolean;

  @IsBoolean()
  activeIncident!: boolean;

  @IsBoolean()
  activeWorkerDeploy!: boolean;

  @IsNumber()
  @Min(0)
  percent!: number;
}

export class P76CanonicalAdminApplyBodyDto {
  @IsString()
  snapshotId!: string;

  @IsString()
  matchResultId!: string;

  @IsString()
  requestedBy!: string;

  @IsString()
  environment!: string;

  @ValidateNested()
  @Type(() => P76CanonicalAdminMutationGateContextDto)
  gateContext!: P76CanonicalAdminMutationGateContextDto;
}

export class P76CanonicalAdminRollbackBodyDto extends P76CanonicalAdminApplyBodyDto {
  @IsString()
  rollbackTokenPlaintext!: string;
}

export function toP76CanonicalAdminApplyBodyV1(
  dto: P76CanonicalAdminApplyBodyDto,
): P76CanonicalAdminApplyBodyV1 {
  return {
    snapshotId: dto.snapshotId,
    matchResultId: dto.matchResultId,
    requestedBy: dto.requestedBy,
    environment: dto.environment,
    gateContext: dto.gateContext as P76CanonicalAdminMutationGateContextBodyV1,
  };
}

export function toP76CanonicalAdminRollbackBodyV1(
  dto: P76CanonicalAdminRollbackBodyDto,
): P76CanonicalAdminRollbackBodyV1 {
  return {
    ...toP76CanonicalAdminApplyBodyV1(dto),
    rollbackTokenPlaintext: dto.rollbackTokenPlaintext,
  };
}
