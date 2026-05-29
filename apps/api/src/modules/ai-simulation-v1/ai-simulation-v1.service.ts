import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { RrmSimMultiCandidateDiagnostic } from "./ai-simulation-v1-rrm-multi-candidate-diagnostic";
import type { RrmRankingProposal } from "./ai-simulation-v1-rrm-ranking-proposal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { Prisma } from "@peima/database";
import { buildMatchReviewStaticSummary } from "../match-review-ai/match-review-static-summary";
import { QuestionnaireService } from "../questionnaire/questionnaire.service";
import { AiSimulationV1ChatClient } from "./ai-simulation-v1-chat.client";
import { runAiSimulationV1JobExecution } from "@peima/ai-simulation-v1-runner";
import { AiSimulationV1ConfigService } from "./ai-simulation-v1.config.service";
import {
  AI_SIMULATION_V1_ENQUEUE_ALLOWED_SOURCE,
  AI_SIMULATION_V1_HINT_SOURCE,
  AI_SIMULATION_V1_SCHEMA,
  AI_SIMULATION_RUN_SPEC_V1,
  ITEM_STATUS,
  JOB_STATUS,
} from "./ai-simulation-v1.constants";
import { resolveSimulationQueueFromHintSnapshot } from "./ai-simulation-v1-hint";
import { buildAiSimulationStaticContext } from "./ai-simulation-v1-static-context";
import { PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION } from "../preview-pool/preview-pool-shortlist-contract.v0";
import type {
  AiSimulationV1EnqueueDto,
  AiSimulationV1RequestRunJobResponse,
  ShortlistContractBindingV0,
} from "./ai-simulation-v1.types";
import { computeShortlistFingerprint } from "./shortlist-contract-binding";
import { buildJobAuditV0 } from "./ai-simulation-v1-job-audit-v0";
import { buildRrmSimMultiCandidateDiagnostic } from "./ai-simulation-v1-rrm-multi-candidate-diagnostic";
import { buildRrmRankingProposal } from "./ai-simulation-v1-rrm-ranking-proposal";
import { evaluateRrmSimFromSimulationV2 } from "./rrm-sim.evaluator";
import type { RrmSimResult } from "./rrm-sim.types";

@Injectable()
export class AiSimulationV1Service {
  private readonly logger = new Logger(AiSimulationV1Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionnaireService: QuestionnaireService,
    private readonly config: AiSimulationV1ConfigService,
    private readonly chatClient: AiSimulationV1ChatClient,
  ) {}

  assertEnabledOrThrow(): void {
    if (!this.config.aiSimulationV1Enabled) {
      throw new HttpException(
        "AI simulation v1 is disabled (set AI_SIMULATION_V1_ENABLED=1)",
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
  }

  async enqueue(
    dto: AiSimulationV1EnqueueDto,
    enqueueSource: typeof AI_SIMULATION_V1_ENQUEUE_ALLOWED_SOURCE,
  ): Promise<{
    simulationJobId: string;
    acceptedCandidateCount: number;
    simulationQueueActual: string[];
  }> {
    this.assertEnabledOrThrow();

    if (enqueueSource !== AI_SIMULATION_V1_ENQUEUE_ALLOWED_SOURCE) {
      throw new BadRequestException({
        code: "AI_SIMULATION_V1_ENQUEUE_INVALID_SOURCE",
        message:
          "AI simulation jobs may only be enqueued from PostPoolDeepScreenOrchestratorService.runOrchestrationMvp (runMode=mvp).",
      });
    }

    if (dto.schemaVersion !== AI_SIMULATION_V1_SCHEMA) {
      throw new BadRequestException(`schemaVersion must be ${AI_SIMULATION_V1_SCHEMA}`);
    }
    if (dto.hintSource !== AI_SIMULATION_V1_HINT_SOURCE) {
      throw new BadRequestException(`hintSource must be ${AI_SIMULATION_V1_HINT_SOURCE}`);
    }
    if (dto.runSpecVersion !== AI_SIMULATION_RUN_SPEC_V1) {
      throw new BadRequestException(`runSpecVersion must be ${AI_SIMULATION_RUN_SPEC_V1}`);
    }

    const pool = await this.prisma.previewPool.findFirst({
      where: { id: dto.poolId, userId: dto.viewerUserId },
    });
    if (!pool) {
      throw new NotFoundException(
        `Preview pool ${dto.poolId} not found for viewer ${dto.viewerUserId}`,
      );
    }

    const b = dto.shortlistBinding;
    if (b == null || typeof b !== "object") {
      throw new BadRequestException({
        code: "AI_SIMULATION_V1_SHORTLIST_BINDING_REQUIRED",
        message: "shortlistBinding is required (Phase C v0 shortlist contract).",
      });
    }
    if (b.previewPoolId !== dto.poolId) {
      throw new BadRequestException(
        "shortlistBinding.previewPoolId must equal enqueue poolId",
      );
    }
    if (b.shortlistSchemaVersion !== PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION) {
      throw new BadRequestException(
        `shortlistBinding.shortlistSchemaVersion must be ${PREVIEW_POOL_SHORTLIST_CONTRACT_SCHEMA_VERSION}`,
      );
    }
    const expectedFp = computeShortlistFingerprint(b.shortlistCandidateUserIds);
    if (b.shortlistFingerprint !== expectedFp) {
      throw new BadRequestException(
        "shortlistBinding.shortlistFingerprint does not match shortlistCandidateUserIds",
      );
    }
    if (b.shortlistCandidateUserIds.length < 2 || b.shortlistCandidateUserIds.length > 3) {
      throw new BadRequestException(
        "shortlistBinding.shortlistCandidateUserIds must have length 2 or 3 for Phase C v0",
      );
    }

    const { entries, simulationQueueActual } = resolveSimulationQueueFromHintSnapshot(dto.hintSnapshot);
    if (simulationQueueActual.length === 0) {
      throw new BadRequestException("No candidates in hintSnapshot after filter and Top-8 trim");
    }

    if (simulationQueueActual.length !== b.shortlistCandidateUserIds.length) {
      throw new BadRequestException(
        "hintSnapshot queue length must match shortlistBinding.shortlistCandidateUserIds (no silent expansion to full pool)",
      );
    }
    for (let i = 0; i < b.shortlistCandidateUserIds.length; i += 1) {
      if (simulationQueueActual[i] !== b.shortlistCandidateUserIds[i]) {
        throw new BadRequestException(
          "hintSnapshot candidate order/ids must exactly match shortlistBinding.shortlistCandidateUserIds",
        );
      }
    }

    const reusableJobId = await this.findReusableAiSimulationJobId({
      viewerUserId: dto.viewerUserId,
      poolId: dto.poolId,
      shortlistFingerprint: b.shortlistFingerprint,
      simulationQueueActual,
    });
    if (reusableJobId) {
      return {
        simulationJobId: reusableJobId,
        acceptedCandidateCount: simulationQueueActual.length,
        simulationQueueActual,
      };
    }

    const job = await this.prisma.$transaction(async (tx) => {
      const j = await tx.aiSimulationV1Job.create({
        data: {
          viewerUserId: dto.viewerUserId,
          poolId: dto.poolId,
          schemaVersion: dto.schemaVersion,
          runSpecVersion: dto.runSpecVersion,
          hintSource: dto.hintSource,
          hintSnapshot: dto.hintSnapshot as object,
          shortlistBinding: b as unknown as Prisma.InputJsonValue,
          simulationQueueActual,
          jobStatus: JOB_STATUS.QUEUED,
        },
      });
      await tx.aiSimulationV1Item.createMany({
        data: entries.map((e) => ({
          jobId: j.id,
          candidateUserId: e.candidateUserId,
          status: ITEM_STATUS.QUEUED,
          attemptCount: 0,
        })),
      });
      return j;
    });

    return {
      simulationJobId: job.id,
      acceptedCandidateCount: simulationQueueActual.length,
      simulationQueueActual,
    };
  }

  async getJobForViewer(jobId: string, viewerUserId: string) {
    const job = await this.prisma.aiSimulationV1Job.findFirst({
      where: { id: jobId, viewerUserId },
      include: {
        items: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    const base = this.formatJobResponse(job);
    const results = await this.enrichResultsWithRrmSim(job.viewerUserId, base.results);
    return { ...base, results };
  }

  /** Admin 轮询：不校验 viewer（调用方须已 admin allowlist）。 */
  async getJobById(jobId: string) {
    const job = await this.prisma.aiSimulationV1Job.findFirst({
      where: { id: jobId },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    const { base, results, rrmSimMultiCandidateDiagnostic, rrmRankingProposal } =
      await this.computeRrmReadonlyEnrichmentForJob(job);
    return { ...base, results, rrmSimMultiCandidateDiagnostic, rrmRankingProposal };
  }

  /**
   * M4.0 matching 只读：同池最新 **completed** job 上复用 admin 的 RRM 诊断链（不重跑 LLM、不写 DB）。
   * `jobStatus === completed` 视为「已成功完成的 simulation job」。
   */
  async getRrmRankingProposalReadonlyForPool(
    viewerUserId: string,
    poolId: string,
  ): Promise<{
    simulationJobId: string;
    rrmRankingProposal: RrmRankingProposal;
    rrmSimMultiCandidateDiagnostic: RrmSimMultiCandidateDiagnostic;
    shortlistBinding: unknown;
  }> {
    const job = await this.prisma.aiSimulationV1Job.findFirst({
      where: {
        poolId,
        viewerUserId,
        jobStatus: JOB_STATUS.COMPLETED,
      },
      orderBy: { updatedAt: "desc" },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (!job) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          message: "No completed AI simulation job exists for this pool.",
          code: "NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL",
        },
        HttpStatus.NOT_FOUND,
      );
    }
    const { rrmSimMultiCandidateDiagnostic, rrmRankingProposal } = await this.computeRrmReadonlyEnrichmentForJob(job);
    return {
      simulationJobId: job.id,
      rrmRankingProposal,
      rrmSimMultiCandidateDiagnostic,
      shortlistBinding: job.shortlistBinding ?? null,
    };
  }

  private async computeRrmReadonlyEnrichmentForJob(job: {
    id: string;
    viewerUserId: string;
    jobStatus: string;
    poolId: string;
    simulationQueueActual: unknown;
    hintSnapshot: unknown;
    shortlistBinding: unknown;
    shortlistDecisionV0: unknown;
    shortlistFourDimV0?: unknown;
    shortlistScenariosV0?: unknown;
    items: Array<{
      candidateUserId: string;
      status: string;
      attemptCount: number;
      transcriptLite: unknown;
      evaluator: unknown;
      failureDetail: unknown | null;
      errorCode: string | null;
    }>;
  }) {
    const base = this.formatJobResponse(job);
    const results = await this.enrichResultsWithRrmSim(job.viewerUserId, base.results);
    const rrmSimMultiCandidateDiagnostic = buildRrmSimMultiCandidateDiagnostic({
      jobId: job.id,
      viewerUserId: job.viewerUserId,
      shortlistDecisionV0: base.shortlistDecisionV0,
      shortlistFourDimV0: base.shortlistFourDimV0,
      shortlistBinding: base.shortlistBinding,
      results,
    });
    const rrmRankingProposal = buildRrmRankingProposal(rrmSimMultiCandidateDiagnostic);
    return { base, results, rrmSimMultiCandidateDiagnostic, rrmRankingProposal };
  }

  /**
   * Phase F v0.4 — admin read-only triage list.
   * Returns minimal diagnostic fields only (no sidecar JSON payload blobs).
   */
  async listJobsForAdminTriage(options?: {
    limit?: number;
    jobStatus?: string;
    sidecarSuppressedReason?: string;
    diagnosticBucket?: string;
    sidecarTrioPresent?: boolean;
    rankConsistent?: boolean;
    hasFailedItem?: boolean;
  }) {
    const limitRaw = Number(options?.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.trunc(limitRaw))) : 50;
    const rows = await this.prisma.aiSimulationV1Job.findMany({
      where: options?.jobStatus ? { jobStatus: options.jobStatus } : undefined,
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            candidateUserId: true,
            status: true,
            evaluator: true,
          },
        },
      },
    });

    const out = rows.map((job) => {
      const audit = buildJobAuditV0(job);
      const itemCounts = audit.itemCounts;
      return {
        simulationJobId: job.id,
        viewerUserId: job.viewerUserId,
        poolId: job.poolId,
        jobStatus: job.jobStatus,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        shortlistBindingPresent: audit.shortlistBindingPresent,
        sidecarTrioPresent: audit.sidecarTrioPresent,
        rankConsistent: audit.rankConsistent,
        sidecarSuppressedReason: audit.sidecarSuppressedReason,
        specClassification: audit.specClassification,
        diagnosticBucket: audit.diagnosticBucket,
        buildabilityDetail: audit.buildabilityDetail,
        itemCounts,
        hasFailedItem: itemCounts.failed > 0,
      };
    });

    return out.filter((row) => {
      if (options?.sidecarSuppressedReason && row.sidecarSuppressedReason !== options.sidecarSuppressedReason) {
        return false;
      }
      if (options?.diagnosticBucket && row.diagnosticBucket !== options.diagnosticBucket) {
        return false;
      }
      if (options?.sidecarTrioPresent != null && row.sidecarTrioPresent !== options.sidecarTrioPresent) {
        return false;
      }
      if (options?.rankConsistent != null && row.rankConsistent !== options.rankConsistent) {
        return false;
      }
      if (options?.hasFailedItem != null && row.hasFailedItem !== options.hasFailedItem) {
        return false;
      }
      return true;
    });
  }

  private async enrichResultsWithRrmSim(
    viewerUserId: string,
    results: Array<{
      candidateUserId: string;
      status: string;
      attemptCount: number;
      transcriptLite: unknown;
      evaluator: unknown;
      failureDetail: unknown | null;
      errorCode: string | null;
    }>,
  ): Promise<
    Array<{
      candidateUserId: string;
      status: string;
      attemptCount: number;
      transcriptLite: unknown;
      evaluator: unknown;
      failureDetail: unknown | null;
      errorCode: string | null;
      rrmSimResult: RrmSimResult;
    }>
  > {
    return Promise.all(
      results.map(async (it) => {
        if (it.status !== ITEM_STATUS.SUCCEEDED) {
          return { ...it, rrmSimResult: evaluateRrmSimFromSimulationV2(it.transcriptLite, null) };
        }
        let staticCtx: Record<string, unknown> | null = null;
        try {
          const viewerView = await this.questionnaireService.getProfileForUser(viewerUserId);
          const candidateView = await this.questionnaireService.getProfileForUser(it.candidateUserId);
          const { reviewStaticScore, staticSummary } = buildMatchReviewStaticSummary(viewerView, candidateView);
          staticCtx = buildAiSimulationStaticContext({
            reviewStaticScore,
            staticSummary,
            viewer: viewerView,
            candidate: candidateView,
          });
        } catch {
          staticCtx = null;
        }
        return { ...it, rrmSimResult: evaluateRrmSimFromSimulationV2(it.transcriptLite, staticCtx) };
      }),
    );
  }

  private formatJobResponse(job: {
    id: string;
    viewerUserId: string;
    jobStatus: string;
    poolId: string;
    simulationQueueActual: unknown;
    hintSnapshot: unknown;
    shortlistBinding: unknown;
    shortlistDecisionV0: unknown;
    shortlistFourDimV0?: unknown;
    shortlistScenariosV0?: unknown;
    items: Array<{
      candidateUserId: string;
      status: string;
      attemptCount: number;
      transcriptLite: unknown;
      evaluator: unknown;
      failureDetail: unknown | null;
      errorCode: string | null;
    }>;
  }) {
    return {
      simulationJobId: job.id,
      viewerUserId: job.viewerUserId,
      jobStatus: job.jobStatus,
      poolId: job.poolId,
      simulationQueueActual: job.simulationQueueActual as string[],
      hintSnapshot: job.hintSnapshot,
      shortlistBinding: job.shortlistBinding ?? null,
      shortlistDecisionV0: job.shortlistDecisionV0 ?? null,
      shortlistFourDimV0: job.shortlistFourDimV0 ?? null,
      shortlistScenariosV0: job.shortlistScenariosV0 ?? null,
      jobAuditV0: buildJobAuditV0(job),
      results: job.items.map((it) => ({
        candidateUserId: it.candidateUserId,
        status: it.status,
        attemptCount: it.attemptCount,
        transcriptLite: it.transcriptLite,
        evaluator: it.evaluator,
        failureDetail: it.failureDetail,
        errorCode: it.errorCode,
      })),
    };
  }

  /**
   * Synchronous path: sets `running` then awaits full job execution in-process (tests / manual only).
   * Admin `POST .../run` uses `requestRunJobAsync` (worker-backed, M3.3-M1).
   */
  async runJob(jobId: string, viewerUserId: string): Promise<void> {
    this.assertEnabledOrThrow();

    const job = await this.prisma.aiSimulationV1Job.findFirst({
      where: { id: jobId, viewerUserId },
      include: { items: true },
    });
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    await this.prisma.aiSimulationV1Job.update({
      where: { id: jobId },
      data: { jobStatus: JOB_STATUS.RUNNING },
    });

    await this.invokeRunAiSimulationV1JobExecution(jobId, viewerUserId);
  }

  /**
   * M3.3-M1: API only enqueues — job stays `queued` until worker claims and runs `runAiSimulationV1JobExecution`.
   * No LLM work in the API process for this path.
   */
  async requestRunJobAsync(
    jobId: string,
    viewerUserId: string,
  ): Promise<AiSimulationV1RequestRunJobResponse> {
    this.assertEnabledOrThrow();

    const head = await this.prisma.aiSimulationV1Job.findFirst({
      where: { id: jobId, viewerUserId },
      select: { id: true, jobStatus: true },
    });
    if (!head) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    if (head.jobStatus === JOB_STATUS.RUNNING) {
      return {
        ok: true,
        jobId: head.id,
        jobStatus: JOB_STATUS.RUNNING,
        started: false,
        reason: "already_running",
      };
    }
    if (head.jobStatus === JOB_STATUS.COMPLETED) {
      return {
        ok: true,
        jobId: head.id,
        jobStatus: JOB_STATUS.COMPLETED,
        started: false,
        reason: "already_completed",
      };
    }

    if (head.jobStatus === JOB_STATUS.QUEUED) {
      return {
        ok: true,
        jobId: head.id,
        jobStatus: JOB_STATUS.QUEUED,
        started: false,
        reason: "enqueued_for_worker",
      };
    }

    return {
      ok: true,
      jobId: head.id,
      jobStatus: head.jobStatus,
      started: false,
      reason: "not_queued_for_worker",
    };
  }

  private async findReusableAiSimulationJobId(params: {
    viewerUserId: string;
    poolId: string;
    shortlistFingerprint: string;
    simulationQueueActual: string[];
  }): Promise<string | null> {
    const recentJobs = await this.prisma.aiSimulationV1Job.findMany({
      where: { viewerUserId: params.viewerUserId, poolId: params.poolId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        jobStatus: true,
        shortlistBinding: true,
        items: { orderBy: { createdAt: "asc" }, select: { candidateUserId: true } },
      },
    });

    for (const row of recentJobs) {
      if (
        row.jobStatus !== JOB_STATUS.QUEUED &&
        row.jobStatus !== JOB_STATUS.RUNNING &&
        row.jobStatus !== JOB_STATUS.COMPLETED
      ) {
        continue;
      }
      const sb = row.shortlistBinding as ShortlistContractBindingV0 | null;
      if (!sb || sb.shortlistFingerprint !== params.shortlistFingerprint) {
        continue;
      }
      const ids = row.items.map((it) => it.candidateUserId);
      if (ids.length !== params.simulationQueueActual.length) {
        continue;
      }
      if (!ids.every((id, i) => id === params.simulationQueueActual[i])) {
        continue;
      }
      return row.id;
    }
    return null;
  }

  /** M3.3-M0: delegates to `@peima/ai-simulation-v1-runner` (same runtime behavior as pre-extract). */
  private invokeRunAiSimulationV1JobExecution(jobId: string, viewerUserId: string): Promise<void> {
    return runAiSimulationV1JobExecution(
      {
        prisma: this.prisma,
        logError: (meta, message) => this.logger.error(meta, message),
        completeChat: (system, user) => this.chatClient.complete(system, user),
        getProfileForUser: (userId) => this.questionnaireService.getProfileForUser(userId),
      },
      { jobId, viewerUserId },
    );
  }
}
