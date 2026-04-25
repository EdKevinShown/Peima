import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PRESCREEN_V0_SCHEMA } from "../prescreen-v0/prescreen-v0.types";
import { AiSimulationV1Service } from "../ai-simulation-v1/ai-simulation-v1.service";
import { PostPoolDeepScreenOrchestratorService } from "../post-pool-deep-screen/post-pool-deep-screen-orchestrator.service";
import { PrescreenV0Service } from "../prescreen-v0/prescreen-v0.service";
import { AdminService } from "./admin.service";
import { AdminAiSimulationV1EnqueueDto } from "./dto/admin-ai-simulation-v1-enqueue.dto";
import { AdminPostPoolOrchestrationMvpDto } from "./dto/admin-post-pool-orchestration-mvp.dto";
import { AdminPostPoolDeepScreenShadowDto } from "./dto/admin-post-pool-deep-screen-shadow.dto";
import { AdminPrescreenV0BatchDebugDto } from "./dto/admin-prescreen-v0-batch-debug.dto";

type JwtReq = {
  user?: { userId: string };
};

@Controller("admin")
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prescreenV0Service: PrescreenV0Service,
    private readonly postPoolDeepScreenOrchestrator: PostPoolDeepScreenOrchestratorService,
    private readonly aiSimulationV1Service: AiSimulationV1Service,
  ) {}

  @Get("capabilities")
  capabilities(@Req() req: JwtReq): { batchMatchTrigger: boolean } {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    return {
      batchMatchTrigger: this.adminService.canSeeBatchMatchTrigger(userId),
    };
  }

  /** AI 模拟 v1 — enqueue（202）；需 AI_SIMULATION_V1_ENABLED=1。 */
  @Post("ai-simulation/v1/enqueue")
  @HttpCode(202)
  async aiSimulationV1Enqueue(@Req() req: JwtReq, @Body() body: AdminAiSimulationV1EnqueueDto) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunAiSimulationV1(userId);
    return this.aiSimulationV1Service.enqueue({
      schemaVersion: body.schemaVersion,
      viewerUserId: body.viewerUserId,
      hintSource: body.hintSource,
      poolId: body.poolId,
      hintSnapshot: body.hintSnapshot,
      runSpecVersion: body.runSpecVersion,
    });
  }

  @Get("ai-simulation/v1/jobs/:jobId")
  async aiSimulationV1GetJob(@Req() req: JwtReq, @Param("jobId") jobId: string) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunAiSimulationV1(userId);
    return this.aiSimulationV1Service.getJobById(jobId);
  }

  @Post("ai-simulation/v1/jobs/:jobId/run")
  @HttpCode(200)
  async aiSimulationV1RunJob(@Req() req: JwtReq, @Param("jobId") jobId: string) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunAiSimulationV1(userId);
    const job = await this.aiSimulationV1Service.getJobById(jobId);
    await this.aiSimulationV1Service.runJob(jobId, job.viewerUserId as string);
    return { ok: true as const };
  }

  /**
   * Shadow: pool → G1-R dimension batch → Prescreen v0; does not enqueue AI simulation.
   * `poolId` is `PreviewPool.id` for a row owned by `viewerUserId`.
   */
  @Post("post-pool-deep-screen/run-shadow")
  async postPoolDeepScreenRunShadow(
    @Req() req: JwtReq,
    @Body() body: AdminPostPoolDeepScreenShadowDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunPostPoolDeepScreenShadow(userId);
    return this.postPoolDeepScreenOrchestrator.runShadow({
      viewerUserId: body.viewerUserId,
      poolId: body.poolId,
      candidateUserIdsOverride: body.candidateUserIdsOverride,
    });
  }

  /**
   * Round 2 orchestrator MVP endpoint.
   * Runs pool artifact read + deep-screen + prescreen;
   * in `runMode="mvp"` it also enqueues AI simulation (enqueue-only by default).
   */
  @Post("post-pool-deep-screen/run-orchestration-mvp")
  async postPoolDeepScreenRunOrchestrationMvp(
    @Req() req: JwtReq,
    @Body() body: AdminPostPoolOrchestrationMvpDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunPostPoolDeepScreenShadow(userId);
    return this.postPoolDeepScreenOrchestrator.runOrchestrationMvp({
      viewerUserId: body.viewerUserId,
      poolId: body.poolId,
      candidateUserIdsOverride: body.candidateUserIdsOverride,
      runMode: body.runMode,
    });
  }

  @Post("prescreen/v0/batch-debug")
  async prescreenV0BatchDebug(
    @Req() req: JwtReq,
    @Body() body: AdminPrescreenV0BatchDebugDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunPrescreenDebug(userId);
    return this.prescreenV0Service.prescreenBatch({
      schemaVersion: PRESCREEN_V0_SCHEMA,
      viewerUserId: body.viewerUserId,
      candidateUserIds: body.candidateUserIds,
      purpose: body.purpose,
    });
  }

  @Post("batch-match/run-once")
  async runBatchMatchOnce(@Req() req: JwtReq): Promise<{ ok: true }> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanTriggerBatchMatch(userId);
    await this.adminService.runBatchMatchSubprocess();
    return { ok: true };
  }
}
