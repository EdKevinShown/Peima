import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import {
  ACCOUNT_MAX_AGE,
  ACCOUNT_MAX_HEIGHT_CM,
  ACCOUNT_MIN_AGE,
  ACCOUNT_MIN_HEIGHT_CM,
} from "@peima/shared/constants";

export class CreateOrUpdatePreferenceDto {
  @IsOptional()
  @IsInt()
  @Min(ACCOUNT_MIN_AGE)
  @Max(ACCOUNT_MAX_AGE)
  minAge?: number;

  @IsOptional()
  @IsInt()
  @Min(ACCOUNT_MIN_AGE)
  @Max(ACCOUNT_MAX_AGE)
  maxAge?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  preferredCities?: string[];

  @IsOptional()
  @IsInt()
  @Min(ACCOUNT_MIN_HEIGHT_CM)
  @Max(ACCOUNT_MAX_HEIGHT_CM)
  minHeight?: number;

  @IsOptional()
  @IsInt()
  @Min(ACCOUNT_MIN_HEIGHT_CM)
  @Max(ACCOUNT_MAX_HEIGHT_CM)
  maxHeight?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  educationPreferences?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  occupationPreferences?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  relationshipGoalPreferences?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(24)
  styleTags?: string[];
}
