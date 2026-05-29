import { Body, Controller, Get, HttpCode, Param, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ViewerPairwiseDecisionCreateJobDto } from "./dto/viewer-pairwise-decision-create-job.dto";
import { AiPairwiseDecisionJobService } from "./ai-pairwise-decision-job.service";
import { mapPairwiseJobPublicToViewerDto } from "./ai-pairwise-decision-viewer.mapper";

type JwtReq = {
  user?: { userId: string };
};

/**
 * M3.8-M5: viewer pairwise job API — JWT-scoped; no admin diagnostics; no LLM on `run`.
 */
@Controller("pairwise-decision")
@UseGuards(JwtAuthGuard)
export class AiPairwiseDecisionViewerController {
  constructor(private readonly jobService: AiPairwiseDecisionJobService) {}

  @Post("jobs")
  @HttpCode(200)
  async createJob(@Req() req: JwtReq, @Body() body: ViewerPairwiseDecisionCreateJobDto) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    const r = await this.jobService.createOrReusePairwiseDecisionJob({
      viewerUserId: userId,
      poolId: body.poolId,
    });
    return { reused: r.reused, job: mapPairwiseJobPublicToViewerDto(r.job) };
  }

  @Post("jobs/:jobId/run")
  @HttpCode(200)
  async runJob(@Req() req: JwtReq, @Param("jobId") jobId: string) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.jobService.requestViewerAsyncRunPairwiseDecisionJob(jobId.trim(), userId);
  }

  @Get("jobs/:jobId")
  async getJob(@Req() req: JwtReq, @Param("jobId") jobId: string) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    const job = await this.jobService.getPairwiseDecisionJobForViewer(jobId.trim(), userId);
    return mapPairwiseJobPublicToViewerDto(job);
  }
}
