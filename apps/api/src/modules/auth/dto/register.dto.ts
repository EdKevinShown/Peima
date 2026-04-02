import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^1[3-9]\d{9}$/, { message: "phone must be an 11-digit CN mobile number" })
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(64)
  nickname!: string;
}
