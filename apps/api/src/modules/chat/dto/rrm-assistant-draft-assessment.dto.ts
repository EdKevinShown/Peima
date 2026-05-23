import { IsString, MaxLength, MinLength } from "class-validator";

export class RrmAssistantDraftAssessmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  draft!: string;
}
