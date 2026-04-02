import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateOrUpdatePreferenceDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  minAge?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  maxAge?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  @ArrayMaxSize(50)
  preferredCities?: string[];

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(260)
  minHeight?: number;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(260)
  maxHeight?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @ArrayMaxSize(50)
  educationPreferences?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  @ArrayMaxSize(50)
  occupationPreferences?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  @ArrayMaxSize(50)
  relationshipGoalPreferences?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  @ArrayMaxSize(100)
  styleTags?: string[];
}
