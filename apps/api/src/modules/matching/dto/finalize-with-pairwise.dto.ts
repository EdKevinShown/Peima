import { IsNotEmpty, IsString } from "class-validator";

export class FinalizeWithPairwiseDto {
  @IsString()
  @IsNotEmpty()
  poolId!: string;

  @IsString()
  @IsNotEmpty()
  pairwiseJobId!: string;
}
