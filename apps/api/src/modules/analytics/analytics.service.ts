import { Injectable } from "@nestjs/common";
import { AnalyticsRepository } from "./analytics.repository";
import type { P2OverviewMineStats, P2OverviewStats } from "./p2-overview.types";

@Injectable()
export class AnalyticsService {
  constructor(private readonly analyticsRepo: AnalyticsRepository) {}

  getP2Overview(): Promise<P2OverviewStats> {
    return this.analyticsRepo.getP2Overview();
  }

  getP2OverviewMine(userId: string): Promise<P2OverviewMineStats> {
    return this.analyticsRepo.getP2OverviewMine(userId);
  }
}
