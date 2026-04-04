import {
  Controller,
  ForbiddenException,
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

/** User ids (JWT `sub`) allowed to read GET /analytics/p2-overview. Empty env → no one. */
function globalP2OverviewAllowedUserIds(): Set<string> {
  const raw = process.env.P2_ANALYTICS_GLOBAL_OVERVIEW_USER_IDS ?? "";
  const ids = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(ids);
}

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
  p2Overview(@Req() req: JwtReq): Promise<P2OverviewStats> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    const allowed = globalP2OverviewAllowedUserIds();
    if (!allowed.has(tokenUserId)) {
      throw new ForbiddenException(
        "global P2 overview is restricted to internal allowlist",
      );
    }
    return this.analyticsService.getP2Overview();
  }
}
