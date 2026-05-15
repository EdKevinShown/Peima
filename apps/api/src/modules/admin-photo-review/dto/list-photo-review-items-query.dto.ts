import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import {
  USER_IMAGE_DETECTION_STATUSES,
  USER_IMAGE_REVIEW_STATUSES,
} from "../admin-photo-review.constants";

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === true || value === "true" || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === "0") {
    return false;
  }
  return undefined;
}

export class ListPhotoReviewItemsQueryDto {
  @IsOptional()
  @IsIn([...USER_IMAGE_REVIEW_STATUSES])
  reviewStatus?: string;

  @IsOptional()
  @IsIn([...USER_IMAGE_DETECTION_STATUSES])
  detectionStatus?: string;

  @IsOptional()
  @IsString()
  reasonCode?: string;

  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  hasWarnings?: boolean;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsISO8601()
  createdAfter?: string;

  @IsOptional()
  @IsISO8601()
  createdBefore?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
