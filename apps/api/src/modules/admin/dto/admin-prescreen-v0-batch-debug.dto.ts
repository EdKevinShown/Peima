import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
} from "class-validator";
import type { PrescreenV0Purpose } from "../../prescreen-v0/prescreen-v0.types";

const PURPOSES: PrescreenV0Purpose[] = ["shadow", "preview_pool_hint", "batch_order_hint"];

export class AdminPrescreenV0BatchDebugDto {
  @IsString()
  @IsNotEmpty()
  viewerUserId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  candidateUserIds!: string[];

  @IsIn(PURPOSES)
  purpose!: PrescreenV0Purpose;
}
