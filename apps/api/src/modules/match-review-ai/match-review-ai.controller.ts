import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ReviewMatchDto } from "./dto/review-match.dto";
import type { MatchReviewResponseDto } from "./match-review-ai.types";
import { MatchReviewAiService } from "./match-review-ai.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("match-review-ai")
@UseGuards(JwtAuthGuard)
export class MatchReviewAiController {
  constructor(private readonly matchReviewAiService: MatchReviewAiService) {}

  @Post("review")
  review(
    @Body() dto: ReviewMatchDto,
    @Req() req: JwtReq,
  ): Promise<MatchReviewResponseDto> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.matchReviewAiService.review(tokenUserId, dto.candidateUserId);
  }
}
