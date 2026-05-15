import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { PHOTO_REVIEW_ADMIN_REASON_CODES } from "../admin-photo-review.constants";

export class ReviewPhotoApproveDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReviewPhotoActionWithReasonsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsIn([...PHOTO_REVIEW_ADMIN_REASON_CODES], { each: true })
  reasonCodes!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
