import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  conversationId!: string;

  @IsString()
  @IsNotEmpty()
  senderUserId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}
