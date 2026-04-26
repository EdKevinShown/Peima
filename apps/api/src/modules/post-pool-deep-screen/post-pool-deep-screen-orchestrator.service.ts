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
  AI_SIMULATION_V1_ENQUEUE_ALLOWED_SOURCE,
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
  PostPoolOrchestrationMvpAiSimulationSkipReason,
  PostPoolOrchestrationMvpEnvelopeDto,
  PostPoolOrchestrationMvpRunDto,
  PostPoolDeepScreenRunDto,
  PostPoolDeepScreenShadowResultDto,
  PostPoolDimensionMatchSummary,
  PostPoolDimensionRow,
  PostPoolSimulationQueueHintEntry,
} from "./post-pool-deep-screen.types";
import { PreviewPoolService } from "../preview-pool/preview-pool.service";
import { PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION } from "../preview-pool/preview-pool-shortlist-contract.v0";
import type { ShortlistContractBindingV0 } from "../ai-simulation-v1/ai-simulation-v1.types";
import { computeShortlistFingerprint } from "../ai-simulation-v1/shortlist-contract-binding";

@Injectable()
export class PostPoolDeepScreenOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prescreenV0Service: PrescreenV0Service,
    private readonly aiSimulationV1Service: AiSimulationV1Service,
    private readonly previewPoolService: PreviewPoolService,
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

    let simulationJobId: string | undefined;
    let acceptedCandidateCount: number | undefined;
    let simulationQueueActual: string[] = [];
    let simulationQueueHintForEnvelope: PostPoolSimulationQueueHintEntry[] =
      dto.runMode === "mvp" ? [] : shadow.simulationQueueHint;

    let aiSimReason: PostPoolOrchestrationMvpAiSimulationSkipReason | undefined;
    let shortlistPhaseCV0SkipReason: PostPoolOrchestrationMvpAiSimulationSkipReason | null =
      null;

    if (dto.runMode !== "mvp") {
      aiSimReason = "not_in_a2_mode";
    } else {
      const sl = await this.resolveShortlistSimulationForMvp(dto, shadow);
      if (!sl.ok) {
        aiSimReason = sl.reason;
        shortlistPhaseCV0SkipReason = sl.reason;
        simulationQueueHintForEnvelope = [];
      } else {
        simulationQueueHintForEnvelope = sl.simulationQueueHint;
        try {
          const enqueue = await this.aiSimulationV1Service.enqueue(
            {
              schemaVersion: AI_SIMULATION_V1_SCHEMA,
              viewerUserId: dto.viewerUserId,
              hintSource: AI_SIMULATION_V1_HINT_SOURCE,
              poolId: dto.poolId,
              hintSnapshot: sl.simulationQueueHint,
              runSpecVersion: AI_SIMULATION_RUN_SPEC_V1,
              shortlistBinding: sl.binding,
            },
            AI_SIMULATION_V1_ENQUEUE_ALLOWED_SOURCE,
          );
          simulationJobId = enqueue.simulationJobId;
          acceptedCandidateCount = enqueue.acceptedCandidateCount;
          simulationQueueActual = enqueue.simulationQueueActual;
        } catch {
          aiSimReason = "no_hint_for_enqueue";
          shortlistPhaseCV0SkipReason = "no_hint_for_enqueue";
          simulationQueueHintForEnvelope = [];
        }
      }
    }

    const shouldEnqueueSimulation = Boolean(simulationJobId);

    const deeplinkQuery = {
      userId: dto.viewerUserId,
      aiSimJobId: simulationJobId ?? null,
    };
    const deeplinkPath = "/final-match" as const;
    const deeplinkUrl = simulationJobId
      ? `${deeplinkPath}?userId=${encodeURIComponent(dto.viewerUserId)}&aiSimJobId=${encodeURIComponent(simulationJobId)}`
      : `${deeplinkPath}?userId=${encodeURIComponent(dto.viewerUserId)}`;

    const consumptionReady =
      dto.runMode === "mvp"
        ? simulationQueueHintForEnvelope.length > 0 && Boolean(simulationJobId)
        : shadow.simulationQueueHint.length > 0;

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
      simulationQueueHint: simulationQueueHintForEnvelope,
      simulationQueueActual,
      deeplink: {
        finalMatchPath: deeplinkPath,
        finalMatchUrl: deeplinkUrl,
        query: deeplinkQuery,
        ready: Boolean(simulationJobId),
      },
      finalMatchConsumptionHint: {
        ready: consumptionReady,
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
        shortlistPhaseCV0SkipReason,
      },
    };
  }

  /**
   * Phase C v0: shortlist-only simulation queue (2–3). No silent fallback to full-pool prescreen hint.
   */
  private async resolveShortlistSimulationForMvp(
    dto: PostPoolOrchestrationMvpRunDto,
    shadow: PostPoolDeepScreenShadowResultDto,
  ): Promise<
    | {
        ok: true;
        binding: ShortlistContractBindingV0;
        simulationQueueHint: PostPoolSimulationQueueHintEntry[];
        prescreenShortlist: NonNullable<PostPoolDeepScreenShadowResultDto["prescreen"]>;
      }
    | { ok: false; reason: PostPoolOrchestrationMvpAiSimulationSkipReason }
  > {
    const pool = await this.prisma.previewPool.findFirst({
      where: { id: dto.poolId, userId: dto.viewerUserId },
      include: { items: { orderBy: { rankInPool: "asc" } } },
    });
    if (!pool?.items?.length) {
      return { ok: false, reason: "shortlist_contract_missing" };
    }

    const contract = await this.previewPoolService.buildShortlistContractV0ForPool(
      dto.viewerUserId,
      dto.poolId,
    );
    if (!contract) {
      return { ok: false, reason: "shortlist_contract_missing" };
    }
    if (contract.schemaVersion !== PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION) {
      return { ok: false, reason: "shortlist_contract_missing" };
    }

    const shortlistIds = [...contract.shortlist.candidateUserIds];
    if (shortlistIds.length < 2) {
      return { ok: false, reason: "shortlist_size_lt_2" };
    }

    const poolItemIds = new Set(pool.items.map((i) => i.candidateUserId));
    for (const id of shortlistIds) {
      if (!poolItemIds.has(id)) {
        return { ok: false, reason: "shortlist_not_subset_of_pool" };
      }
    }

    const passedSet = new Set(shadow.dimensionMatchSummary.passedCandidateUserIds);
    for (const id of shortlistIds) {
      if (!passedSet.has(id)) {
        return { ok: false, reason: "shortlist_dimension_ineligible" };
      }
    }

    const prescreenShortlist = await this.prescreenV0Service.prescreenBatch({
      schemaVersion: PRESCREEN_V0_SCHEMA,
      viewerUserId: dto.viewerUserId,
      candidateUserIds: shortlistIds,
      purpose: "shadow",
    });

    const rowById = new Map(
      prescreenShortlist.results.map((r) => [r.candidateUserId, r]),
    );
    const simulationQueueHint: PostPoolSimulationQueueHintEntry[] = [];

    for (let idx = 0; idx < shortlistIds.length; idx += 1) {
      const id = shortlistIds[idx];
      const r = rowById.get(id);
      if (!r) {
        return { ok: false, reason: "shortlist_prescreen_incomplete" };
      }
      if (r.bucket === "demote") {
        return { ok: false, reason: "shortlist_prescreen_demoted" };
      }
      simulationQueueHint.push({
        rankHint: idx + 1,
        candidateUserId: id,
        bucket: r.bucket as "promote" | "neutral",
        prescreenScore: r.prescreenScore,
      });
    }

    const binding: ShortlistContractBindingV0 = {
      previewPoolId: dto.poolId,
      shortlistSchemaVersion: contract.schemaVersion,
      shortlistCandidateUserIds: shortlistIds,
      shortlistFingerprint: computeShortlistFingerprint(shortlistIds),
    };

    return { ok: true, binding, simulationQueueHint, prescreenShortlist };
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
