import { Controller, Get, Param, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AiSimulationV1Service } from "./ai-simulation-v1.service";

type JwtReq = {
  user?: { userId: string };
};

/**
 * Viewer-safe AI simulation job read (M4.0.1).
 * Does not expose admin-only diagnostics (`rrmSimMultiCandidateDiagnostic`, `rrmRankingProposal`).
 */
@Controller("ai-simulation/v1")
@UseGuards(JwtAuthGuard)
export class AiSimulationV1ViewerController {
  constructor(private readonly aiSimulationV1Service: AiSimulationV1Service) {}

  @Get("jobs/:jobId")
  getJobForViewer(@Param("jobId") jobId: string, @Req() req: JwtReq) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.aiSimulationV1Service.getJobForViewer(jobId.trim(), userId);
  }
}
