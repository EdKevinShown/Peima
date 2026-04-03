import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AnalyticsService } from "./analytics.service";
import type { P2OverviewMineStats, P2OverviewStats } from "./p2-overview.types";

type JwtReq = {
  user?: { userId: string };
};

@Controller("analytics")
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** More specific route first. */
  @Get("p2-overview/mine")
  p2OverviewMine(@Req() req: JwtReq): Promise<P2OverviewMineStats> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.analyticsService.getP2OverviewMine(tokenUserId);
  }

  @Get("p2-overview")
  p2Overview(): Promise<P2OverviewStats> {
    return this.analyticsService.getP2Overview();
  }
}
