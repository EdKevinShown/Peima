/**
 * M3.3-M0: shared job execution for AI Simulation v1 (extracted from AiSimulationV1Service).
 * Imports simulation helpers from apps/api until a later refactor inlines or relocates them.
 */
import { Prisma, type PrismaClient } from "@peima/database";
import { buildMatchReviewStaticSummary } from "../../../apps/api/src/modules/match-review-ai/match-review-static-summary";
import type {
  AiSimulationV1ChatFailureKind,
  AiSimulationV1ChatResult,
} from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-chat.client";
import {
  AI_SIMULATION_RRM_SOURCE_TYPE,
  AI_SIMULATION_RRM_SOURCE_VERSION,
} from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-rrm.constants";
import {
  ITEM_STATUS,
  JOB_STATUS,
} from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1.constants";
import { resolveSimulationQueueFromHintSnapshot } from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-hint";
import { parseAndValidateAiSimulationLlmPayloadAny } from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-llm-payload.validate";
import {
  buildInvalidJsonObservabilityDetail,
  extractJsonObjectFromLlmText,
} from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-json-extract";
import { buildAiSimulationV2SystemPrompt, buildAiSimulationV2UserPrompt } from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-prompt";
import { buildAiSimulationStaticContext } from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-static-context";
import { buildLegacyEvaluatorShimFromV2 } from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-legacy-evaluator-shim";
import type { AiSimulationLlmPayloadV2 } from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1.types";
import type {
  AiSimulationItemErrorCode,
  SimulationHintSnapshotEntry,
} from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1.types";
import { recomputeAiSimulationJobSidecarsV0 } from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-job-sidecars-recompute";
import type { QuestionnaireProfileView } from "../../../apps/api/src/modules/questionnaire/questionnaire.service";

export type AiSimulationV1JobRunPorts = {
  prisma: PrismaClient;
  logError: (meta: Record<string, unknown>, message: string) => void;
  completeChat: (system: string, user: string) => Promise<AiSimulationV1ChatResult>;
  getProfileForUser: (userId: string) => Promise<QuestionnaireProfileView>;
};

function truncateForFailureDetail(s: string | undefined, maxLen: number): string | undefined {
  if (s == null || s === "") return undefined;
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

/** Safe JSON for `failureDetail` — never includes prompts or request bodies. */
function buildChatTransportFailureDetail(
  chat: Extract<AiSimulationV1ChatResult, { ok: false }>,
): Prisma.InputJsonValue {
  switch (chat.kind) {
    case "http":
      return {
        source: "ai_simulation_v1_chat",
        kind: "http",
        httpStatus: chat.status ?? null,
        providerBodySnippet: truncateForFailureDetail(chat.detail, 400),
      };
    case "network":
      return {
        source: "ai_simulation_v1_chat",
        kind: "network",
        message: truncateForFailureDetail(chat.detail, 300),
      };
    case "timeout":
      return { source: "ai_simulation_v1_chat", kind: "timeout" };
    case "invalid_json_response":
      return {
        source: "ai_simulation_v1_chat",
        kind: "invalid_json_response",
        message: truncateForFailureDetail(chat.detail, 300),
      };
    case "empty_content":
      return { source: "ai_simulation_v1_chat", kind: "empty_content" };
    default:
      return { source: "ai_simulation_v1_chat", kind: chat.kind };
  }
}

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

function normalizeV2ForPersist(
  payload: AiSimulationLlmPayloadV2,
  viewerUserId: string,
  candidateUserId: string,
): AiSimulationLlmPayloadV2 {
  return {
    ...payload,
    participants: { viewerUserId, candidateUserId },
    sourceType: AI_SIMULATION_RRM_SOURCE_TYPE,
    sourceVersion: AI_SIMULATION_RRM_SOURCE_VERSION,
    fallbackUsed: false,
  };
}

async function runOneItemWithRetries(
  ports: AiSimulationV1JobRunPorts,
  viewerUserId: string,
  itemId: string,
  candidateUserId: string,
): Promise<void> {
  const { prisma, completeChat, getProfileForUser } = ports;
  const jobRow = await prisma.aiSimulationV1Item.findUnique({
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

  let viewerView: QuestionnaireProfileView;
  let candidateView: QuestionnaireProfileView;
  try {
    viewerView = await getProfileForUser(viewerUserId);
    candidateView = await getProfileForUser(candidateUserId);
  } catch {
    await prisma.aiSimulationV1Item.update({
      where: { id: itemId },
      data: {
        status: ITEM_STATUS.FAILED,
        errorCode: "schema_validation",
        attemptCount: 1,
      },
    });
    return;
  }

  const { reviewStaticScore, staticSummary } = buildMatchReviewStaticSummary(viewerView, candidateView);

  const staticContext = buildAiSimulationStaticContext({
    reviewStaticScore,
    staticSummary,
    viewer: viewerView,
    candidate: candidateView,
  });

  const system = buildAiSimulationV2SystemPrompt();
  const user = buildAiSimulationV2UserPrompt({
    viewerUserId,
    candidateUserId,
    hint,
    staticContext,
  });

  let lastError: AiSimulationItemErrorCode = "http_error";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await prisma.aiSimulationV1Item.update({
      where: { id: itemId },
      data: {
        status: ITEM_STATUS.RUNNING,
        attemptCount: attempt,
      },
    });

    const chat = await completeChat(system, user);
    if (!chat.ok) {
      lastError = mapFailureKindToErrorCode(chat.kind);
      if (attempt < 2 && isRetryableErrorCode(lastError)) {
        continue;
      }
      await prisma.aiSimulationV1Item.update({
        where: { id: itemId },
        data: {
          status: ITEM_STATUS.FAILED,
          errorCode: lastError,
          failureDetail:
            chat.kind === "empty_content"
              ? (buildInvalidJsonObservabilityDetail({
                  reason: "empty_content",
                  rawContent: "",
                }) as object)
              : (buildChatTransportFailureDetail(chat) as object),
        },
      });
      return;
    }

    const rawContent = chat.content;
    const extracted = extractJsonObjectFromLlmText(rawContent);
    if (!extracted.ok) {
      lastError = "invalid_json";
      if (attempt < 2 && isRetryableErrorCode(lastError)) {
        continue;
      }
      await prisma.aiSimulationV1Item.update({
        where: { id: itemId },
        data: {
          status: ITEM_STATUS.FAILED,
          errorCode: "invalid_json",
          failureDetail: buildInvalidJsonObservabilityDetail({
            reason: extracted.reason,
            rawContent,
          }) as object,
        },
      });
      return;
    }

    try {
      JSON.parse(extracted.jsonText);
    } catch (e) {
      lastError = "invalid_json";
      if (attempt < 2 && isRetryableErrorCode(lastError)) {
        continue;
      }
      await prisma.aiSimulationV1Item.update({
        where: { id: itemId },
        data: {
          status: ITEM_STATUS.FAILED,
          errorCode: "invalid_json",
          failureDetail: buildInvalidJsonObservabilityDetail({
            reason: "json_parse_error",
            parseMessage: e instanceof Error ? e.message : String(e),
            rawContent,
          }) as object,
        },
      });
      return;
    }

    const validated = parseAndValidateAiSimulationLlmPayloadAny(extracted.jsonText);

    if (!validated.ok) {
      if (validated.failure === "schema") {
        await prisma.aiSimulationV1Item.update({
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
      if (attempt < 2 && isRetryableErrorCode(lastError)) {
        continue;
      }
      await prisma.aiSimulationV1Item.update({
        where: { id: itemId },
        data: {
          status: ITEM_STATUS.FAILED,
          errorCode: "invalid_json",
          failureDetail: buildInvalidJsonObservabilityDetail({
            reason: "json_parse_error",
            parseMessage: "parse_validate_rejected_payload",
            rawContent,
          }) as object,
        },
      });
      return;
    }

    if (validated.version !== 2) {
      await prisma.aiSimulationV1Item.update({
        where: { id: itemId },
        data: {
          status: ITEM_STATUS.FAILED,
          errorCode: "schema_validation",
          failureDetail: {
            path: "schemaVersion",
            reason: "expected_v2_payload_for_current_prompt",
          } as object,
        },
      });
      return;
    }

    const normalized = normalizeV2ForPersist(validated.payload, viewerUserId, candidateUserId);
    const shim = buildLegacyEvaluatorShimFromV2(normalized);
    await prisma.aiSimulationV1Item.update({
      where: { id: itemId },
      data: {
        status: ITEM_STATUS.SUCCEEDED,
        transcriptLite: normalized as unknown as object,
        evaluator: shim as unknown as object,
        errorCode: null,
        failureDetail: Prisma.DbNull,
      },
    });
    return;
  }
}

/**
 * Runs all queued items for the job, then recomputes sidecars and sets jobStatus completed.
 * Caller must have already transitioned the job to `running` when using async admin flow.
 */
export async function runAiSimulationV1JobExecution(
  ports: AiSimulationV1JobRunPorts,
  params: { jobId: string; viewerUserId: string },
): Promise<void> {
  const { prisma, logError } = ports;
  const { jobId, viewerUserId } = params;

  try {
    const items = await prisma.aiSimulationV1Item.findMany({
      where: { jobId, status: ITEM_STATUS.QUEUED },
      orderBy: { createdAt: "asc" },
    });

    try {
      for (const item of items) {
        await runOneItemWithRetries(ports, viewerUserId, item.id, item.candidateUserId);
      }
    } finally {
      const finished = await prisma.aiSimulationV1Job.findFirst({
        where: { id: jobId },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
      const reco =
        finished != null
          ? recomputeAiSimulationJobSidecarsV0({
              shortlistBinding: finished.shortlistBinding,
              items: finished.items.map((it) => ({
                candidateUserId: it.candidateUserId,
                status: it.status,
                evaluator: it.evaluator,
                transcriptLite: it.transcriptLite,
              })),
            })
          : {
              fourDim: null,
              decision: null,
              rankConsistent: false,
            };
      const { fourDim, decision, rankConsistent } = reco;
      const updateData: Record<string, unknown> = {
        jobStatus: JOB_STATUS.COMPLETED,
        shortlistDecisionV0:
          rankConsistent && decision != null
            ? (decision as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        shortlistFourDimV0:
          rankConsistent && fourDim != null
            ? (fourDim as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        /** M0.7: synthetic 10-scene `shortlistScenariosV0` removed from product path; use item `transcriptLite` v2 `scenarioResults` instead. */
        shortlistScenariosV0: Prisma.DbNull,
      };
      await prisma.aiSimulationV1Job.update({
        where: { id: jobId },
        data: updateData as unknown as Prisma.AiSimulationV1JobUpdateInput,
      });
    }
  } catch (err: unknown) {
    logError(
      { err, jobId, viewerUserId, event: "ai_simulation_v1_execute_run_job_body_failed" },
      "ai_simulation_v1_execute_run_job_body_failed",
    );
    try {
      await prisma.aiSimulationV1Job.update({
        where: { id: jobId },
        data: { jobStatus: JOB_STATUS.COMPLETED },
      });
    } catch (inner) {
      logError(
        { err: inner, jobId, event: "ai_simulation_v1_finalize_job_after_execute_error_failed" },
        "ai_simulation_v1_finalize_job_after_execute_error_failed",
      );
    }
  }
}
