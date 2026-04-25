import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

export class AdminPostPoolOrchestrationMvpDto {
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

  @IsString()
  @IsIn(["shadow", "hint_only", "mvp"])
  runMode!: "shadow" | "hint_only" | "mvp";
}
