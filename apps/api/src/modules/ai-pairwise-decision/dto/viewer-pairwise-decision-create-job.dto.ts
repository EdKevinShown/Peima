import { IsString, MinLength } from "class-validator";

/** M3.8-M5: viewer creates pairwise job for own pools (`viewerUserId` from JWT only). */
export class ViewerPairwiseDecisionCreateJobDto {
  @IsString()
  @MinLength(1)
  poolId!: string;
}
