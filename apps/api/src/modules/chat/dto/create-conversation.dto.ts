import { IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class CreateConversationDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  /** M5.5-Chat-R2A: optional — server resolves display candidate via `resolveMatchResultDisplay`. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  matchResultId?: string;
}
