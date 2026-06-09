import { ACCOUNT_GENDER_VALUES } from "@peima/shared/constants";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export class QuestionnaireAnswerItemDto {
  @IsString()
  @IsNotEmpty()
  questionKey!: string;

  @IsString()
  @IsNotEmpty()
  answerValue!: string;
}

export class SubmitQuestionnaireDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsArray()
  @ArrayMinSize(30)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => QuestionnaireAnswerItemDto)
  answers!: QuestionnaireAnswerItemDto[];

  /** Synced to `User.gender` when provided (male/female). Omitted for legacy clients. */
  @IsOptional()
  @IsString()
  @IsIn([...ACCOUNT_GENDER_VALUES])
  gender?: string;
}
