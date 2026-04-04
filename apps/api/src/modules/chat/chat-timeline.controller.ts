import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CHAT_TIMELINE_MESSAGE_LIMIT } from "./chat-timeline.mapper";
import { ChatService } from "./chat.service";

type JwtReq = {
  user?: { userId: string };
};

/** Isolated controller so the timeline route is always registered on `chat` prefix. */
@Controller("chat")
@UseGuards(JwtAuthGuard)
export class ChatTimelineController {
  constructor(private readonly chatService: ChatService) {}

  @Get("conversations/:conversationId/timeline")
  getConversationTimeline(
    @Param("conversationId") conversationId: string,
    @Query("messageSkip") messageSkipRaw: string | undefined,
    @Query("messageLimit") messageLimitRaw: string | undefined,
    @Req() req: JwtReq,
  ) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }

    let messageSkip = 0;
    if (messageSkipRaw !== undefined && messageSkipRaw !== "") {
      const n = Number(messageSkipRaw);
      if (!Number.isInteger(n) || n < 0) {
        throw new BadRequestException("messageSkip must be a non-negative integer");
      }
      messageSkip = n;
    }

    let messageLimit = CHAT_TIMELINE_MESSAGE_LIMIT;
    if (messageLimitRaw !== undefined && messageLimitRaw !== "") {
      const n = Number(messageLimitRaw);
      if (!Number.isInteger(n) || n < 1) {
        throw new BadRequestException("messageLimit must be a positive integer");
      }
      messageLimit = Math.min(n, CHAT_TIMELINE_MESSAGE_LIMIT);
    }

    return this.chatService.getRelationshipTimeline(conversationId, tokenUserId, {
      messageSkip,
      messageLimit,
    });
  }
}
