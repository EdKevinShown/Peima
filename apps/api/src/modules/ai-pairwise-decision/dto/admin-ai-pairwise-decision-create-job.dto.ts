import { IsString, MinLength } from "class-validator";

export class AdminAiPairwiseDecisionCreateJobDto {
  @IsString()
  @MinLength(1)
  viewerUserId!: string;

  @IsString()
  @MinLength(1)
  poolId!: string;
}
