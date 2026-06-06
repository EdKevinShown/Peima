import {
  BadRequestException,
  Body,
  Controller,
  Get,
  GoneException,
  HttpCode,
  InternalServerErrorException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Permission } from "@peima/shared/constants";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RbacGuard, RequirePermission } from "../../common/rbac/rbac.guard";
import { PRESCREEN_V0_SCHEMA } from "../prescreen-v0/prescreen-v0.types";
import { AI_SIMULATION_V1_ENQUEUE_HTTP_DEPRECATED_CODE } from "../ai-simulation-v1/ai-simulation-v1.constants";
import { AiSimulationV1Service } from "../ai-simulation-v1/ai-simulation-v1.service";
import { PostPoolDeepScreenOrchestratorService } from "../post-pool-deep-screen/post-pool-deep-screen-orchestrator.service";
import { PrescreenV0Service } from "../prescreen-v0/prescreen-v0.service";
import { AdminService } from "./admin.service";
import { MatchingObservabilitySummaryService } from "./matching-observability-summary.service";
import { RrmObservationSummaryService } from "./rrm-observation-summary.service";
import { RrmEvalCollectorService } from "../rrm-eval";
import { AdminPostPoolOrchestrationMvpDto } from "./dto/admin-post-pool-orchestration-mvp.dto";
import { AdminPostPoolDeepScreenShadowDto } from "./dto/admin-post-pool-deep-screen-shadow.dto";
import { AdminPrescreenV0BatchDebugDto } from "./dto/admin-prescreen-v0-batch-debug.dto";
import { AdminMyAiRecordsService } from "./admin-my-ai-records.service";

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
    private readonly rrmObservationSummaryService: RrmObservationSummaryService,
    private readonly matchingObservabilitySummaryService: MatchingObservabilitySummaryService,
    private readonly rrmEvalCollectorService: RrmEvalCollectorService,
    private readonly adminMyAiRecordsService: AdminMyAiRecordsService,
  ) {}

  @Get("capabilities")
  @UseGuards(RbacGuard)
  @RequirePermission(Permission.VIEW_ADMIN_CAPABILITIES)
  capabilities(@Req() req: JwtReq): { batchMatchTrigger: boolean } {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    return {
      batchMatchTrigger: this.adminService.canSeeBatchMatchTrigger(userId),
    };
  }

  /**
   * Retired: direct AI simulation enqueue. Jobs must be created via
   * `POST /admin/post-pool-deep-screen/run-orchestration-mvp` with `runMode: "mvp"`.
   */
  @Post("ai-simulation/v1/enqueue")
  aiSimulationV1EnqueueRetired(@Req() req: JwtReq) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunAiSimulationV1(userId);
    throw new GoneException({
      statusCode: 410,
      error: "Gone",
      code: AI_SIMULATION_V1_ENQUEUE_HTTP_DEPRECATED_CODE,
      message:
        "Direct POST /admin/ai-simulation/v1/enqueue is no longer supported. Create jobs via POST /admin/post-pool-deep-screen/run-orchestration-mvp with JSON body.runMode set to \"mvp\" (shortlist-only enqueue is built there).",
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

  @Get("ai-simulation/v1/jobs")
  async aiSimulationV1ListJobs(
    @Req() req: JwtReq,
    @Query("limit") limit?: string,
    @Query("jobStatus") jobStatus?: string,
    @Query("sidecarSuppressedReason") sidecarSuppressedReason?: string,
    @Query("diagnosticBucket") diagnosticBucket?: string,
    @Query("sidecarTrioPresent") sidecarTrioPresent?: string,
    @Query("rankConsistent") rankConsistent?: string,
    @Query("hasFailedItem") hasFailedItem?: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunAiSimulationV1(userId);

    const parseBool = (x?: string): boolean | undefined => {
      if (x == null || x === "") return undefined;
      if (x === "true") return true;
      if (x === "false") return false;
      return undefined;
    };

    return this.aiSimulationV1Service.listJobsForAdminTriage({
      limit: limit ? Number(limit) : undefined,
      jobStatus: jobStatus?.trim() || undefined,
      sidecarSuppressedReason: sidecarSuppressedReason?.trim() || undefined,
      diagnosticBucket: diagnosticBucket?.trim() || undefined,
      sidecarTrioPresent: parseBool(sidecarTrioPresent),
      rankConsistent: parseBool(rankConsistent),
      hasFailedItem: parseBool(hasFailedItem),
    });
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
    return this.aiSimulationV1Service.requestRunJobAsync(jobId, job.viewerUserId as string);
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
    await this.adminService.runBatchMatchSubprocess({
      triggeredByUserId: userId,
      channel: "admin_batch_match",
    });
    return { ok: true };
  }

  /** P7.11-r1 / M4.4-M2: read-only matching pipeline observability (pairwise / sim / finalize / pool counts). */
  @Get("matching-observability/summary")
  async matchingObservabilitySummary(
    @Req() req: JwtReq,
    @Query("limit") limit?: string,
    @Query("sinceDays") sinceDays?: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanReadMatchingObservabilitySummary(userId);
    try {
      return await this.matchingObservabilitySummaryService.getSummary({
        limit,
        sinceDays,
      });
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new InternalServerErrorException(
        "failed_to_build_matching_observability_summary",
      );
    }
  }

  /** M6.7-C3: read-only anonymous summary for admin/debug observation. */
  @Get("rrm-observation/summary")
  async rrmObservationSummary(
    @Req() req: JwtReq,
    @Query("limit") limit?: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunAiSimulationV1(userId);
    try {
      return await this.rrmObservationSummaryService.getSummary(limit);
    } catch {
      throw new InternalServerErrorException(
        "failed_to_build_rrm_observation_summary",
      );
    }
  }

  /** M5.1-r11 — de-identified RRM-Eval cohort aggregates (no RFI per user; no MatchResult writes). */
  @Get("rrm-eval/aggregate")
  async rrmEvalAggregate(
    @Req() req: JwtReq,
    @Query("limit") limit?: string,
    @Query("sinceDays") sinceDays?: string,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanReadMatchingObservabilitySummary(userId);
    try {
      return await this.rrmEvalCollectorService.buildAggregate({ limit, sinceDays });
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new InternalServerErrorException("failed_to_build_rrm_eval_aggregate");
    }
  }

  /** Admin self-service: inspect own persisted AI outputs/snapshots for diagnostics. */
  @Get("my-ai-records")
  async myAiRecords(@Req() req: JwtReq) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanRunAiSimulationV1(userId);
    return this.adminMyAiRecordsService.getMine(userId);
  }
}
