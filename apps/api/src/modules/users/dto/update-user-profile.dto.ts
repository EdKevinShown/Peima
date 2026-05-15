import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import {
  ACCOUNT_CITY_VALUES,
  ACCOUNT_EDUCATION_VALUES,
  ACCOUNT_GENDER_VALUES,
  ACCOUNT_MAX_AGE,
  ACCOUNT_MAX_HEIGHT_CM,
  ACCOUNT_MIN_AGE,
  ACCOUNT_MIN_HEIGHT_CM,
  ACCOUNT_OCCUPATION_CATEGORY_VALUES,
  ACCOUNT_RELATIONSHIP_GOAL_VALUES,
} from "@peima/shared/constants";

/** Partial update; omit fields you do not wish to change (P7.5-r4-j structured values). */
export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: "phone must be an 11-digit CN mobile number" })
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  nickname?: string;

  @IsOptional()
  @IsString()
  @IsIn([...ACCOUNT_GENDER_VALUES])
  gender?: string;

  @IsOptional()
  @IsInt()
  @Min(ACCOUNT_MIN_AGE)
  @Max(ACCOUNT_MAX_AGE)
  age?: number;

  @IsOptional()
  @IsString()
  @IsIn([...ACCOUNT_CITY_VALUES])
  city?: string;

  @IsOptional()
  @IsInt()
  @Min(ACCOUNT_MIN_HEIGHT_CM)
  @Max(ACCOUNT_MAX_HEIGHT_CM)
  height?: number;

  @IsOptional()
  @IsString()
  @IsIn([...ACCOUNT_EDUCATION_VALUES])
  education?: string;

  @IsOptional()
  @IsString()
  @IsIn([...ACCOUNT_OCCUPATION_CATEGORY_VALUES])
  occupation?: string;

  @IsOptional()
  @IsString()
  @IsIn([...ACCOUNT_RELATIONSHIP_GOAL_VALUES])
  relationshipGoal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string;
}
