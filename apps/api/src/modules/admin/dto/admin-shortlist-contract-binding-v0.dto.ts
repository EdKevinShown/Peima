import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  Matches,
  ValidateNested,
} from "class-validator";
import { PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION } from "../../preview-pool/preview-pool-shortlist-contract.v0";

export class AdminShortlistContractBindingV0Dto {
  @IsString()
  previewPoolId!: string;

  @IsString()
  @IsIn([PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION])
  shortlistSchemaVersion!: typeof PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  shortlistCandidateUserIds!: string[];

  /** sha256 hex of sorted unique ids joined by `|` — must match `computeShortlistFingerprint`. */
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  shortlistFingerprint!: string;
}

/** @internal Nest mapping helper */
export function toShortlistBindingPlain(dto: AdminShortlistContractBindingV0Dto) {
  return {
    previewPoolId: dto.previewPoolId,
    shortlistSchemaVersion: dto.shortlistSchemaVersion,
    shortlistCandidateUserIds: dto.shortlistCandidateUserIds,
    shortlistFingerprint: dto.shortlistFingerprint,
  };
}
