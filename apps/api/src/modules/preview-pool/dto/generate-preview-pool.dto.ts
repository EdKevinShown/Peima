import { IsNotEmpty, IsString } from "class-validator";

export class GeneratePreviewPoolDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
