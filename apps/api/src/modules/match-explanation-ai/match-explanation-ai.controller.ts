import {
  Controller,
  Get,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { MatchExplanationAiResponseDto } from "./dto/match-explanation-ai-response.dto";
import { MatchExplanationAiService } from "./match-explanation-ai.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("match-explanation-ai")
@UseGuards(JwtAuthGuard)
export class MatchExplanationAiController {
  constructor(
    private readonly matchExplanationAiService: MatchExplanationAiService,
  ) {}

  @Get("match-results/:matchResultId")
  getMatchExplanation(
    @Param("matchResultId") matchResultId: string,
    @Req() req: JwtReq,
  ): Promise<MatchExplanationAiResponseDto> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.matchExplanationAiService.getExplanation(
      matchResultId,
      tokenUserId,
    );
  }
}
