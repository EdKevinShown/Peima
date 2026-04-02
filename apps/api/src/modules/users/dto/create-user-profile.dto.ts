import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateUserProfileDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: "phone must be an 11-digit CN mobile number" })
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(64)
  nickname!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  gender?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  age?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  city?: string;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(260)
  height?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  education?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  occupation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  relationshipGoal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  bio?: string;
}
