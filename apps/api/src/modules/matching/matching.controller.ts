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
import type { BatchMatchQueue, MatchResult } from "@peima/database";
import { EnqueueMatchDto } from "./dto/enqueue-match.dto";
import type { MatchStatusPayload } from "./matching.service";
import { MatchingService } from "./matching.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

type JwtReq = {
  user?: { userId: string };
};

@UseGuards(JwtAuthGuard)
@Controller("matching")
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post("enqueue")
  enqueue(
    @Body() dto: EnqueueMatchDto,
    @Req() req: JwtReq,
  ): Promise<BatchMatchQueue> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || dto.userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.matchingService.enqueue(dto);
  }

  @Get("status/:userId")
  getStatus(
    @Param("userId") userId: string,
    @Req() req: JwtReq,
  ): Promise<MatchStatusPayload> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.matchingService.getStatusForUser(userId);
  }

  @Get("result/:userId")
  getResult(
    @Param("userId") userId: string,
    @Req() req: JwtReq,
  ): Promise<MatchResult> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.matchingService.getLatestResultForUser(userId);
  }
}
