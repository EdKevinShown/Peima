import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { Prisma } from "@peima/database";
import { buildMatchReviewStaticSummary } from "../match-review-ai/match-review-static-summary";
import { QuestionnaireService } from "../questionnaire/questionnaire.service";
import { AiSimulationV1ChatClient } from "./ai-simulation-v1-chat.client";
import { AiSimulationV1ConfigService } from "./ai-simulation-v1.config.service";
import {
  AI_SIMULATION_V1_HINT_SOURCE,
  AI_SIMULATION_V1_SCHEMA,
  AI_SIMULATION_RUN_SPEC_V1,
  ITEM_STATUS,
  JOB_STATUS,
} from "./ai-simulation-v1.constants";
import { resolveSimulationQueueFromHintSnapshot } from "./ai-simulation-v1-hint";
import {
  extractJsonObjectString,
  parseAndValidateAiSimulationLlmPayloadV1,
} from "./ai-simulation-v1-llm-payload.validate";
import { buildAiSimulationV1SystemPrompt, buildAiSimulationV1UserPrompt } from "./ai-simulation-v1-prompt";
import type { AiSimulationItemErrorCode, AiSimulationV1EnqueueDto } from "./ai-simulation-v1.types";
import type { AiSimulationV1ChatFailureKind } from "./ai-simulation-v1-chat.client";
import type { SimulationHintSnapshotEntry } from "./ai-simulation-v1.types";

function mapFailureKindToErrorCode(kind: AiSimulationV1ChatFailureKind): AiSimulationItemErrorCode {
  switch (kind) {
    case "timeout":
      return "timeout";
    case "http":
      return "http_error";
    case "invalid_json_response":
      return "invalid_json";
    case "empty_content":
      return "invalid_json";
    case "network":
      return "http_error";
    case "disabled":
      return "disabled";
    case "missing_api_key":
      return "missing_api_key";
    default:
      return "http_error";
  }
}

function isRetryableErrorCode(code: AiSimulationItemErrorCode): boolean {
  return code === "timeout" || code === "http_error" || code === "invalid_json";
}

@Injectable()
export class AiSimulationV1Service {
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

  async enqueue(dto: AiSimulationV1EnqueueDto): Promise<{
    simulationJobId: string;
    acceptedCandidateCount: number;
    simulationQueueActual: string[];
  }> {
    this.assertEnabledOrThrow();

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

    const { entries, simulationQueueActual } = resolveSimulationQueueFromHintSnapshot(dto.hintSnapshot);
    if (simulationQueueActual.length === 0) {
      throw new BadRequestException("No candidates in hintSnapshot after filter and Top-8 trim");
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
    return this.formatJobResponse(job);
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
    return this.formatJobResponse(job);
  }

  private formatJobResponse(job: {
    id: string;
    viewerUserId: string;
    jobStatus: string;
    poolId: string;
    simulationQueueActual: unknown;
    hintSnapshot: unknown;
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
   * Runs all queued items for the job (in-process). Idempotent for already terminal items.
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

    const items = await this.prisma.aiSimulationV1Item.findMany({
      where: { jobId, status: ITEM_STATUS.QUEUED },
      orderBy: { createdAt: "asc" },
    });

    try {
      for (const item of items) {
        await this.runOneItemWithRetries(job.viewerUserId, item.id, item.candidateUserId);
      }
    } finally {
      await this.prisma.aiSimulationV1Job.update({
        where: { id: jobId },
        data: { jobStatus: JOB_STATUS.COMPLETED },
      });
    }
  }

  private async runOneItemWithRetries(
    viewerUserId: string,
    itemId: string,
    candidateUserId: string,
  ): Promise<void> {
    const jobRow = await this.prisma.aiSimulationV1Item.findUnique({
      where: { id: itemId },
      include: { job: true },
    });
    if (!jobRow || jobRow.status !== ITEM_STATUS.QUEUED) return;

    const hintList = resolveSimulationQueueFromHintSnapshot(jobRow.job.hintSnapshot).entries;
    const hint =
      hintList.find((h) => h.candidateUserId === candidateUserId) ??
      ({
        rankHint: 0,
        candidateUserId,
        bucket: "neutral",
        prescreenScore: 0,
      } as SimulationHintSnapshotEntry);

    let viewerView;
    let candidateView;
    try {
      viewerView = await this.questionnaireService.getProfileForUser(viewerUserId);
      candidateView = await this.questionnaireService.getProfileForUser(candidateUserId);
    } catch {
      await this.prisma.aiSimulationV1Item.update({
        where: { id: itemId },
        data: {
          status: ITEM_STATUS.FAILED,
          errorCode: "schema_validation",
          attemptCount: 1,
        },
      });
      return;
    }

    const { reviewStaticScore, staticSummary } = buildMatchReviewStaticSummary(
      viewerView,
      candidateView,
    );

    const system = buildAiSimulationV1SystemPrompt();
    const user = buildAiSimulationV1UserPrompt({
      viewerUserId,
      candidateUserId,
      hint,
      reviewStaticScore,
      majorFitsCount: staticSummary.majorFits.length,
      majorRisksCount: staticSummary.majorRisks.length,
    });

    let lastError: AiSimulationItemErrorCode = "http_error";

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await this.prisma.aiSimulationV1Item.update({
        where: { id: itemId },
        data: {
          status: ITEM_STATUS.RUNNING,
          attemptCount: attempt,
        },
      });

      const chat = await this.chatClient.complete(system, user);
      if (!chat.ok) {
        lastError = mapFailureKindToErrorCode(chat.kind);
        if (attempt < 2 && isRetryableErrorCode(lastError)) {
          continue;
        }
        await this.prisma.aiSimulationV1Item.update({
          where: { id: itemId },
          data: {
            status: ITEM_STATUS.FAILED,
            errorCode: lastError,
            failureDetail: Prisma.DbNull,
          },
        });
        return;
      }

      const jsonStr = extractJsonObjectString(chat.content);
      const validated = parseAndValidateAiSimulationLlmPayloadV1(jsonStr);

      if (!validated.ok) {
        if (validated.failure === "schema") {
          await this.prisma.aiSimulationV1Item.update({
            where: { id: itemId },
            data: {
              status: ITEM_STATUS.FAILED,
              errorCode: "schema_validation",
              failureDetail: validated.detail as object,
            },
          });
          return;
        }
        lastError = "invalid_json";
        if (attempt < 2) {
          continue;
        }
        await this.prisma.aiSimulationV1Item.update({
          where: { id: itemId },
          data: {
            status: ITEM_STATUS.FAILED,
            errorCode: "invalid_json",
            failureDetail: Prisma.DbNull,
          },
        });
        return;
      }

      await this.prisma.aiSimulationV1Item.update({
        where: { id: itemId },
        data: {
          status: ITEM_STATUS.SUCCEEDED,
          transcriptLite: validated.payload.transcript_lite as object,
          evaluator: validated.payload.evaluator as object,
          errorCode: null,
          failureDetail: Prisma.DbNull,
        },
      });
      return;
    }
  }
}
