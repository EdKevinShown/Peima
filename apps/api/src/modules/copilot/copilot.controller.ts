import {
  Controller,
  Get,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { CopilotInsightsResponse } from "./dto/copilot-response.dto";
import { CopilotService } from "./copilot.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("copilot")
@UseGuards(JwtAuthGuard)
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Get("conversations/:conversationId/insights")
  getInsights(
    @Param("conversationId") conversationId: string,
    @Req() req: JwtReq,
  ): Promise<CopilotInsightsResponse> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.copilotService.getConversationInsights(
      conversationId,
      tokenUserId,
    );
  }
}
