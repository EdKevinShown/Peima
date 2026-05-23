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
import type { ProfileUpdateSuggestion } from "@peima/database";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { RrmObservedReadonlyService } from "../rrm-observed";
import { RrmAssistantReadonlyService } from "../rrm-assistant/rrm-assistant-readonly.service";
import { RrmAssistantDraftAssessmentDto } from "./dto/rrm-assistant-draft-assessment.dto";
import { ChatService } from "./chat.service";
import { ConversationProfileCompletionService } from "./conversation-profile-completion.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

type JwtReq = {
  user?: { userId: string };
};

@Controller("chat")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly rrmObservedReadonlyService: RrmObservedReadonlyService,
    private readonly rrmAssistantReadonlyService: RrmAssistantReadonlyService,
    private readonly conversationProfileCompletionService: ConversationProfileCompletionService,
  ) {}

  @Post("conversations")
  createConversation(
    @Body() dto: CreateConversationDto,
    @Req() req: JwtReq,
  ) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || dto.userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    const mid = dto.matchResultId?.trim();
    return this.chatService.createOrReuseConversation(tokenUserId, mid || undefined);
  }

  @Get("conversations/:conversationId/summary")
  getConversationSummary(
    @Param("conversationId") conversationId: string,
    @Req() req: JwtReq,
  ) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.chatService.getConversationSummaryPlaceholder(
      conversationId,
      tokenUserId,
    );
  }

  @Post("conversations/:conversationId/summary/generate")
  generateConversationSummary(
    @Param("conversationId") conversationId: string,
    @Req() req: JwtReq,
  ) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.chatService.generateConversationSummaryPersisted(
      conversationId,
      tokenUserId,
    );
  }

  /** M5.1-r6 — readonly observed rhythm signals; no RFI_obs; no MatchResult writes. */
  @Get("conversations/:conversationId/rrm-observed-summary")
  getRrmObservedSummary(
    @Param("conversationId") conversationId: string,
    @Req() req: JwtReq,
  ) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.rrmObservedReadonlyService.getReadonlySummaryForConversation(
      conversationId,
      tokenUserId,
    );
  }

  /** M5.1-r8 — draft ActionFit (readonly); does not write MatchResult or send messages. */
  @Post("conversations/:conversationId/rrm-assistant-draft-assessment")
  assessRrmAssistantDraft(
    @Param("conversationId") conversationId: string,
    @Body() dto: RrmAssistantDraftAssessmentDto,
    @Req() req: JwtReq,
  ) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.rrmAssistantReadonlyService.assessDraftForConversation(
      conversationId,
      tokenUserId,
      dto.draft,
    );
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

  @Post("conversations/:conversationId/profile-completion-suggestion")
  generateProfileCompletionSuggestion(
    @Param("conversationId") conversationId: string,
    @Req() req: JwtReq,
  ): Promise<ProfileUpdateSuggestion> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.conversationProfileCompletionService.generateProfileCompletionSuggestion(
      conversationId,
      tokenUserId,
    );
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
