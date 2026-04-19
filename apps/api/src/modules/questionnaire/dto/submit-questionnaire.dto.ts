import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
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
}
