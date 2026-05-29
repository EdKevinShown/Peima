import { Body, Controller, Get, HttpCode, Param, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminService } from "../admin/admin.service";
import { AdminAiPairwiseDecisionCreateJobDto } from "./dto/admin-ai-pairwise-decision-create-job.dto";
import { AiPairwiseDecisionJobService } from "./ai-pairwise-decision-job.service";

type JwtReq = {
  user?: { userId: string };
};

/**
 * M3.8-M3: minimal **admin-only** API for pairwise decision jobs (no viewer routes; no Final Match).
 */
@Controller("admin/ai-pairwise-decision")
@UseGuards(JwtAuthGuard)
export class AiPairwiseDecisionAdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly jobService: AiPairwiseDecisionJobService,
  ) {}

  @Post("jobs")
  @HttpCode(200)
  async createJob(@Req() req: JwtReq, @Body() body: AdminAiPairwiseDecisionCreateJobDto) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunAiSimulationV1(userId);
    return this.jobService.createOrReusePairwiseDecisionJob({
      viewerUserId: body.viewerUserId,
      poolId: body.poolId,
    });
  }

  @Post("jobs/:jobId/run")
  @HttpCode(200)
  async runJob(@Req() req: JwtReq, @Param("jobId") jobId: string) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunAiSimulationV1(userId);
    return this.jobService.requestAdminRunPairwiseDecisionJob(jobId);
  }

  @Get("jobs/:jobId")
  async getJob(@Req() req: JwtReq, @Param("jobId") jobId: string) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunAiSimulationV1(userId);
    return this.jobService.getPairwiseDecisionJob(jobId);
  }
}
