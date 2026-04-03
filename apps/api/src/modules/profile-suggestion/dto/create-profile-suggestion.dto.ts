import { IsIn, IsNotEmpty, IsObject, IsString, MaxLength } from "class-validator";
import { P2SourceType } from "@peima/shared/constants";

const SOURCE_TYPE_VALUES = Object.values(P2SourceType);

export class CreateProfileSuggestionDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(SOURCE_TYPE_VALUES)
  sourceType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sourceVersion!: string;

  @IsObject()
  proposedPatch!: Record<string, unknown>;
}
