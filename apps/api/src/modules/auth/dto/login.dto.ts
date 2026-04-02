import { IsNotEmpty, IsString, Matches } from "class-validator";

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^1[3-9]\d{9}$/, { message: "phone must be an 11-digit CN mobile number" })
  phone!: string;
}
