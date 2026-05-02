import { Prisma } from "@peima/database";
import type { AiPairwiseDecision, RelationshipShortlistTop2 } from "./ai-pairwise-decision.types";
import { parseAndValidateAiPairwiseDecision, parseAndValidateRelationshipShortlistTop2 } from "./ai-pairwise-decision.validate";
import type {
  GenerateAiPairwiseDecisionFailureDetail,
  GenerateAiPairwiseDecisionResult,
} from "./ai-pairwise-decision-generate.contracts";
import { AI_PAIRWISE_DECISION_JOB_STATUS } from "./ai-pairwise-decision-job.constants";
import { buildPairwiseFinalSourceShadowRecord } from "./ai-pairwise-final-source-shadow";

export type AiPairwiseDecisionJobExecutionDelegate = {
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
};

function safeJson(obj: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(obj)) as Prisma.InputJsonValue;
}

/** Strip oversized strings defensively (failureDetail must not carry raw LLM). */
export function sanitizePairwiseFailureForPersistence(
  d: GenerateAiPairwiseDecisionFailureDetail,
): GenerateAiPairwiseDecisionFailureDetail {
  const max = 2000;
  const clip = (s: string | undefined) => (s && s.length > max ? `${s.slice(0, max)}…` : s);
  return {
    ...d,
    message: clip(d.message) ?? d.message,
    reason: clip(d.reason),
    expected: clip(d.expected),
    actual: clip(d.actual),
  };
}

/**
 * M3.8-M4A: after `queued`→`running` claim, run LLM + persist terminal `succeeded` / `failed`.
 * Shared by `runPairwiseDecisionJobSync` and the worker consumer.
 */
export async function executeClaimedAiPairwiseDecisionJob(params: {
  db: AiPairwiseDecisionJobExecutionDelegate;
  jobId: string;
  viewerUserId: string;
  poolId: string;
  shortlistSnapshot: unknown;
  generate: (shortlist: RelationshipShortlistTop2) => Promise<GenerateAiPairwiseDecisionResult>;
}): Promise<void> {
  const { db, jobId, viewerUserId, poolId, shortlistSnapshot, generate } = params;

  const shortlistParsed = parseAndValidateRelationshipShortlistTop2(shortlistSnapshot);
  if (!shortlistParsed.ok) {
    const failDetail: GenerateAiPairwiseDecisionFailureDetail = {
      code: "schema_validation",
      message: "Persisted shortlistSnapshot failed contract validation.",
      path: shortlistParsed.failureDetail.path,
      reason: shortlistParsed.failureDetail.reason,
    };
    await db.update({
      where: { id: jobId },
      data: {
        status: AI_PAIRWISE_DECISION_JOB_STATUS.FAILED,
        failureDetail: safeJson(failDetail),
        decisionResult: Prisma.JsonNull,
        finalSourceShadow: Prisma.JsonNull,
        completedAt: new Date(),
      },
    });
    return;
  }

  const sl = shortlistParsed.value;

  const shadowJson = (decision: AiPairwiseDecision | null, jobStatus: "succeeded" | "failed") =>
    safeJson(
      buildPairwiseFinalSourceShadowRecord({
        pairwiseJobId: jobId,
        viewerUserId,
        poolId,
        shortlist: sl,
        decision,
        jobStatus,
      }),
    );

  const gen = await generate(sl);

  if (!gen.ok) {
    await db.update({
      where: { id: jobId },
      data: {
        status: AI_PAIRWISE_DECISION_JOB_STATUS.FAILED,
        failureDetail: safeJson(sanitizePairwiseFailureForPersistence(gen.failureDetail)),
        decisionResult: Prisma.JsonNull,
        fallbackUsed: null,
        finalSourceShadow: shadowJson(null, "failed"),
        completedAt: new Date(),
      },
    });
    return;
  }

  const decisionCheck = parseAndValidateAiPairwiseDecision(gen.value);
  if (!decisionCheck.ok) {
    const failDetail: GenerateAiPairwiseDecisionFailureDetail = {
      code: "schema_validation",
      message: "Post-LLM validation unexpectedly failed.",
      path: decisionCheck.failureDetail.path,
      reason: decisionCheck.failureDetail.reason,
    };
    await db.update({
      where: { id: jobId },
      data: {
        status: AI_PAIRWISE_DECISION_JOB_STATUS.FAILED,
        failureDetail: safeJson(failDetail),
        decisionResult: Prisma.JsonNull,
        finalSourceShadow: shadowJson(null, "failed"),
        completedAt: new Date(),
      },
    });
    return;
  }

  await db.update({
    where: { id: jobId },
    data: {
      status: AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED,
      decisionResult: decisionCheck.value as unknown as Prisma.InputJsonValue,
      failureDetail: Prisma.JsonNull,
      fallbackUsed: decisionCheck.value.fallbackUsed,
      finalSourceShadow: shadowJson(decisionCheck.value, "succeeded"),
      completedAt: new Date(),
    },
  });
}
