import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { UserProfile } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AiSimulationV1Service } from "../ai-simulation-v1/ai-simulation-v1.service";
import {
  AI_SIMULATION_RUN_SPEC_V1,
  AI_SIMULATION_V1_HINT_SOURCE,
  AI_SIMULATION_V1_SCHEMA,
} from "../ai-simulation-v1/ai-simulation-v1.constants";
import { PrescreenV0Service } from "../prescreen-v0/prescreen-v0.service";
import { PRESCREEN_V0_SCHEMA } from "../prescreen-v0/prescreen-v0.types";
import {
  POST_POOL_DEEP_SCREEN_SCHEMA,
  POST_POOL_ORCHESTRATION_MVP_SCHEMA,
  POST_POOL_DIMENSION_PROFILE_SCORE_HARD_FAIL_BELOW,
  POST_POOL_DIMENSION_RULE_VERSION,
} from "./post-pool-deep-screen.constants";
import { computeG1rProfileScalarScore } from "./post-pool-dimension-g1r";
import type {
  PostPoolOrchestrationMvpEnvelopeDto,
  PostPoolOrchestrationMvpRunDto,
  PostPoolDeepScreenRunDto,
  PostPoolDeepScreenShadowResultDto,
  PostPoolDimensionMatchSummary,
  PostPoolDimensionRow,
  PostPoolSimulationQueueHintEntry,
} from "./post-pool-deep-screen.types";

@Injectable()
export class PostPoolDeepScreenOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prescreenV0Service: PrescreenV0Service,
    private readonly aiSimulationV1Service: AiSimulationV1Service,
  ) {}

  /**
   * A2 flow for Round 2 orchestrator MVP:
   * pool artifact read → deep-screen → prescreen → (mvp mode) AI simulation enqueue.
   * Default behavior remains enqueue-only (no synchronous run).
   */
  async runOrchestrationMvp(
    dto: PostPoolOrchestrationMvpRunDto,
  ): Promise<PostPoolOrchestrationMvpEnvelopeDto> {
    const shadow = await this.runShadow({
      viewerUserId: dto.viewerUserId,
      poolId: dto.poolId,
      candidateUserIdsOverride: dto.candidateUserIdsOverride,
    });

    const candidateCount = shadow.dimensionMatchSummary.rows.length;
    const passedCount = shadow.dimensionMatchSummary.passedCandidateUserIds.length;
    const droppedCount = Math.max(0, candidateCount - passedCount);

    const bucketCounts = { promote: 0, neutral: 0, demote: 0 };
    for (const row of shadow.prescreen?.results ?? []) {
      if (row.bucket === "promote") bucketCounts.promote += 1;
      else if (row.bucket === "neutral") bucketCounts.neutral += 1;
      else bucketCounts.demote += 1;
    }

    const prescreenStatus = shadow.prescreen ? "done" : "skipped";

    const shouldEnqueueSimulation = dto.runMode === "mvp" && shadow.simulationQueueHint.length > 0;
    let simulationJobId: string | undefined;
    let acceptedCandidateCount: number | undefined;
    let simulationQueueActual: string[] = [];

    if (shouldEnqueueSimulation) {
      const enqueue = await this.aiSimulationV1Service.enqueue({
        schemaVersion: AI_SIMULATION_V1_SCHEMA,
        viewerUserId: dto.viewerUserId,
        hintSource: AI_SIMULATION_V1_HINT_SOURCE,
        poolId: dto.poolId,
        hintSnapshot: shadow.simulationQueueHint,
        runSpecVersion: AI_SIMULATION_RUN_SPEC_V1,
      });
      simulationJobId = enqueue.simulationJobId;
      acceptedCandidateCount = enqueue.acceptedCandidateCount;
      simulationQueueActual = enqueue.simulationQueueActual;
    }

    const aiSimReason =
      dto.runMode !== "mvp" ? "not_in_a2_mode" : shadow.simulationQueueHint.length === 0 ? "no_hint_for_enqueue" : undefined;

    const deeplinkQuery = {
      userId: dto.viewerUserId,
      aiSimJobId: simulationJobId ?? null,
    };
    const deeplinkPath = "/final-match" as const;
    const deeplinkUrl = simulationJobId
      ? `${deeplinkPath}?userId=${encodeURIComponent(dto.viewerUserId)}&aiSimJobId=${encodeURIComponent(simulationJobId)}`
      : `${deeplinkPath}?userId=${encodeURIComponent(dto.viewerUserId)}`;

    return {
      schemaVersion: POST_POOL_ORCHESTRATION_MVP_SCHEMA,
      viewerUserId: dto.viewerUserId,
      poolId: dto.poolId,
      runMode: dto.runMode,
      stages: {
        previewPool: {
          status: "done",
          candidateCount,
        },
        deepScreen: {
          status: "done",
          passedCount,
          droppedCount,
        },
        prescreen: {
          status: prescreenStatus,
          candidateCount: shadow.prescreen?.results.length ?? 0,
          bucketCounts,
        },
        aiSimulation: {
          status: shouldEnqueueSimulation ? "done" : "skipped",
          reason: aiSimReason,
          simulationJobId,
          acceptedCandidateCount,
          runTriggered: false,
        },
      },
      simulationQueueHint: shadow.simulationQueueHint,
      simulationQueueActual,
      deeplink: {
        finalMatchPath: deeplinkPath,
        finalMatchUrl: deeplinkUrl,
        query: deeplinkQuery,
        ready: Boolean(simulationJobId),
      },
      finalMatchConsumptionHint: {
        ready: shadow.simulationQueueHint.length > 0,
        source: "orchestrator_a2",
        poolId: dto.poolId,
        runMode: dto.runMode,
        prescreen: {
          candidateCount: shadow.prescreen?.results.length ?? 0,
          bucketCounts,
        },
        aiSimulation: {
          enqueued: Boolean(simulationJobId),
          simulationJobId,
          acceptedCandidateCount,
        },
        notes: simulationJobId
          ? ["simulation_enqueued"]
          : [aiSimReason ?? "simulation_not_enqueued"],
      },
      debug: {
        usedCandidateOverride: shadow.debug.usedCandidateOverride,
        candidateUserIdsSource: shadow.candidateUserIdsSource,
        prescreenSkippedReason: shadow.debug.prescreenSkippedReason,
      },
    };
  }

  /**
   * Shadow orchestration: pool candidates → G1-R dimension batch → Prescreen v0.
   * Does not enqueue AI simulation, write MatchResult, or touch worker scoring.
   */
  async runShadow(dto: PostPoolDeepScreenRunDto): Promise<PostPoolDeepScreenShadowResultDto> {
    const pool = await this.prisma.previewPool.findFirst({
      where: { id: dto.poolId, userId: dto.viewerUserId },
      include: { items: { orderBy: { rankInPool: "asc" } } },
    });

    if (!pool) {
      throw new NotFoundException(
        `Preview pool not found for poolId=${dto.poolId} and viewerUserId=${dto.viewerUserId}`,
      );
    }

    const overrideRaw = dto.candidateUserIdsOverride?.filter((id) => id && id.trim()) ?? [];
    const override = [...new Set(overrideRaw)];
    const usedOverride = override.length > 0;
    if (usedOverride && override.length > 200) {
      throw new BadRequestException("candidateUserIdsOverride must have at most 200 ids after dedupe");
    }

    const fromPool = [...new Set(pool.items.map((i) => i.candidateUserId))];
    const candidateUserIds = usedOverride ? override : fromPool;

    if (candidateUserIds.length === 0) {
      throw new BadRequestException("No candidate user ids resolved from pool or override");
    }

    const viewerProfileRow = await this.prisma.userProfile.findUnique({
      where: { userId: dto.viewerUserId },
    });
    if (!viewerProfileRow) {
      throw new BadRequestException(
        `Viewer ${dto.viewerUserId} has no questionnaire profile; cannot run post-pool dimension batch`,
      );
    }

    const candProfiles = await this.prisma.userProfile.findMany({
      where: { userId: { in: candidateUserIds } },
    });
    const profileByUserId = new Map<string, UserProfile>(
      candProfiles.map((p) => [p.userId, p as UserProfile]),
    );

    const rows: PostPoolDimensionRow[] = [];
    const passed: string[] = [];

    const viewerProf = viewerProfileRow as UserProfile;

    for (const candidateUserId of candidateUserIds) {
      const candProf = profileByUserId.get(candidateUserId) ?? null;
      let profileScore: number | null = null;
      let dimensionHardFail = false;
      let dimensionHardFailReason: PostPoolDimensionRow["dimensionHardFailReason"] = null;

      if (!candProf) {
        dimensionHardFail = true;
        dimensionHardFailReason = "missing_profile";
      } else {
        profileScore = computeG1rProfileScalarScore(viewerProf, candProf);
        if (profileScore < POST_POOL_DIMENSION_PROFILE_SCORE_HARD_FAIL_BELOW) {
          dimensionHardFail = true;
          dimensionHardFailReason = "low_profile_score";
        }
      }

      if (!dimensionHardFail) {
        passed.push(candidateUserId);
      }

      rows.push({
        candidateUserId,
        profileScore,
        dimensionHardFail,
        dimensionHardFailReason,
      });
    }

    let prescreen = null;
    let prescreenSkippedReason: PostPoolDeepScreenShadowResultDto["debug"]["prescreenSkippedReason"] =
      null;

    if (passed.length > 0) {
      prescreen = await this.prescreenV0Service.prescreenBatch({
        schemaVersion: PRESCREEN_V0_SCHEMA,
        viewerUserId: dto.viewerUserId,
        candidateUserIds: passed,
        purpose: "shadow",
      });
    } else {
      prescreenSkippedReason = "no_candidates_passed_dimension";
    }

    const simulationQueueHint = this.buildSimulationQueueHint(prescreen);

    return {
      schemaVersion: POST_POOL_DEEP_SCREEN_SCHEMA,
      shadow: true,
      viewerUserId: dto.viewerUserId,
      poolId: dto.poolId,
      candidateUserIdsSource: usedOverride ? "override" : "preview_pool_items",
      dimensionMatchSummary: {
        ruleVersion: POST_POOL_DIMENSION_RULE_VERSION,
        profileScoreHardFailBelow: POST_POOL_DIMENSION_PROFILE_SCORE_HARD_FAIL_BELOW,
        rows,
        passedCandidateUserIds: passed,
      },
      prescreen,
      simulationQueueHint,
      simulationQueueActual: [],
      debug: {
        usedCandidateOverride: usedOverride,
        prescreenSkippedReason,
      },
    };
  }

  /**
   * Same as {@link runShadow} but enforces `tokenUserId === dto.viewerUserId` for HTTP callers.
   */
  async runShadowForViewer(
    tokenUserId: string,
    dto: PostPoolDeepScreenRunDto,
  ): Promise<PostPoolDeepScreenShadowResultDto> {
    if (tokenUserId !== dto.viewerUserId) {
      throw new ForbiddenException("viewerUserId must match authenticated user");
    }
    return this.runShadow(dto);
  }

  private buildSimulationQueueHint(
    prescreen: PostPoolDeepScreenShadowResultDto["prescreen"],
  ): PostPoolSimulationQueueHintEntry[] {
    if (!prescreen?.results?.length) return [];

    const filtered = prescreen.results.filter((r) => r.bucket !== "demote");
    return filtered.map((r, i) => ({
      rankHint: i + 1,
      candidateUserId: r.candidateUserId,
      bucket: r.bucket,
      prescreenScore: r.prescreenScore,
    }));
  }
}
