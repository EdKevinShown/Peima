import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class AdminPostPoolDeepScreenShadowDto {
  @IsString()
  @IsNotEmpty()
  viewerUserId!: string;

  @IsString()
  @IsNotEmpty()
  poolId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  candidateUserIdsOverride?: string[];
}
