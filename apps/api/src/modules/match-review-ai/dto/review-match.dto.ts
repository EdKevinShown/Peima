import { IsNotEmpty, IsString } from "class-validator";

/** POST /match-review-ai/review — viewer 来自 JWT，仅传最终匹配对象 id。 */
export class ReviewMatchDto {
  @IsString()
  @IsNotEmpty()
  candidateUserId!: string;
}
