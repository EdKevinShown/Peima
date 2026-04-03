import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  P2_FEEDBACK_SUBJECT_KINDS,
  P2SourceType,
} from "@peima/shared/constants";

const SOURCE_TYPE_VALUES = Object.values(P2SourceType);
const SUBJECT_KIND_VALUES = [...P2_FEEDBACK_SUBJECT_KINDS] as string[];

export class CreateFeedbackDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(SUBJECT_KIND_VALUES)
  subjectKind!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  subjectId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(32)
  @MaxLength(64, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(SOURCE_TYPE_VALUES)
  sourceType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sourceVersion!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  recordedAt?: string;
}
