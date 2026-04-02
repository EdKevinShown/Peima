import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateUserImageDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(4096)
  imageUrl!: string;

  @IsOptional()
  faceEmbedding?: Record<string, unknown> | unknown[] | string | number | boolean | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  @Max(1)
  attractivenessScore?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  @ArrayMaxSize(100)
  styleTags?: string[];

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(100)
  ageEstimate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  genderEstimate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  @Max(1)
  confidence?: number;
}
