import {
  Controller,
  Get,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { SummaryAiResponseDto } from "./dto/summary-ai-response.dto";
import { SummaryAiService } from "./summary-ai.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("summary-ai")
@UseGuards(JwtAuthGuard)
export class SummaryAiController {
  constructor(private readonly summaryAiService: SummaryAiService) {}

  @Get("conversations/:conversationId")
  getConversationSummaryAi(
    @Param("conversationId") conversationId: string,
    @Req() req: JwtReq,
  ): Promise<SummaryAiResponseDto> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.summaryAiService.getAiSummary(conversationId, tokenUserId);
  }
}
