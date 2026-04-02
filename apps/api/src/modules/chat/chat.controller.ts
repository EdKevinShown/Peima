import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { ChatService } from "./chat.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

type JwtReq = {
  user?: { userId: string };
};

@Controller("chat")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post("conversations")
  createConversation(
    @Body() dto: CreateConversationDto,
    @Req() req: JwtReq,
  ) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || dto.userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.chatService.createOrReuseConversation(tokenUserId);
  }

  @Get("conversations/:conversationId")
  getConversation(
    @Param("conversationId") conversationId: string,
    @Req() req: JwtReq,
  ) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.chatService.getConversationWithMessages(conversationId, tokenUserId);
  }

  @Post("messages")
  sendMessage(@Body() dto: SendMessageDto, @Req() req: JwtReq) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || dto.senderUserId !== tokenUserId) {
      throw new UnauthorizedException("senderUserId mismatch");
    }
    return this.chatService.sendMessage(dto);
  }

  @Get("user/:userId/latest")
  getLatestConversation(
    @Param("userId") userId: string,
    @Req() req: JwtReq,
  ) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.chatService.getLatestConversationForUser(tokenUserId);
  }
}
