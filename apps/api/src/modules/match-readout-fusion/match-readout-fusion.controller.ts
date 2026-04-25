import {
  Controller,
  Get,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { MatchReadoutFusionResponseDto } from "./match-readout-fusion.types";
import { MatchReadoutFusionService } from "./match-readout-fusion.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("match-readout-fusion")
@UseGuards(JwtAuthGuard)
export class MatchReadoutFusionController {
  constructor(private readonly fusionService: MatchReadoutFusionService) {}

  @Get("match-results/:matchResultId")
  getReadoutFusion(
    @Param("matchResultId") matchResultId: string,
    @Req() req: JwtReq,
  ): Promise<MatchReadoutFusionResponseDto> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.fusionService.getReadoutFusion(matchResultId, tokenUserId);
  }
}
