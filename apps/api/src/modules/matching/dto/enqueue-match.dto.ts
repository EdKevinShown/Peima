import { IsNotEmpty, IsString } from "class-validator";

export class EnqueueMatchDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
