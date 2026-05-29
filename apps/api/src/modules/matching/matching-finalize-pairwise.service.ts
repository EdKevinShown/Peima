import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AI_PAIRWISE_DECISION_JOB_STATUS } from "../ai-pairwise-decision/ai-pairwise-decision-job.constants";
import type { AiPairwiseDecision } from "../ai-pairwise-decision/ai-pairwise-decision.types";
import {
  buildPairwiseFinalSourceShadowRecord,
  parseStoredFinalSourceShadowRecord,
} from "../ai-pairwise-decision/ai-pairwise-final-source-shadow";
import { parseAndValidateAiPairwiseDecision, parseAndValidateRelationshipShortlistTop2 } from "../ai-pairwise-decision/ai-pairwise-decision.validate";
import { buildFinalMatchDecisionMetaV1, type FinalMatchDecisionMetaV1 } from "./final-match-decision-meta.builder";
import { readPairwiseFinalizeEnv } from "./pairwise-finalize-env";

export type FinalizeWithPairwiseStatus = "pending" | "finalized" | "already_frozen" | "disabled";

export type FinalizeWithPairwiseResponse = {
  ok: true;
  status: FinalizeWithPairwiseStatus;
  finalMatchDecisionMeta: FinalMatchDecisionMetaV1 | null;
};

@Injectable()
export class MatchingFinalizePairwiseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * M3.8-M11: minimal finalize sidecar — **never** updates `MatchResult.candidateUserId` or `finalScore`.
   * If a row already exists for `(viewerUserId, poolId)`, returns stored meta (**late pairwise does not replace**).
   */
  async finalizeWithPairwise(params: {
    viewerUserId: string;
    poolId: string;
    pairwiseJobId: string;
  }): Promise<FinalizeWithPairwiseResponse> {
    const env = readPairwiseFinalizeEnv();

    const existing = await this.prisma.pairwisePoolFinalizeMeta.findUnique({
      where: {
        viewerUserId_poolId: {
          viewerUserId: params.viewerUserId,
          poolId: params.poolId,
        },
      },
    });
    if (existing) {
      return {
        ok: true,
        status: "already_frozen",
        finalMatchDecisionMeta: existing.meta as unknown as FinalMatchDecisionMetaV1,
      };
    }

    const job = await this.prisma.aiPairwiseDecisionJob.findFirst({
      where: {
        id: params.pairwiseJobId,
        viewerUserId: params.viewerUserId,
        poolId: params.poolId,
      },
    });
    if (!job) {
      throw new NotFoundException("pairwise job not found");
    }

    if (
      job.status === AI_PAIRWISE_DECISION_JOB_STATUS.QUEUED ||
      job.status === AI_PAIRWISE_DECISION_JOB_STATUS.RUNNING
    ) {
      return { ok: true, status: "pending", finalMatchDecisionMeta: null };
    }

    const shortlistParsed = parseAndValidateRelationshipShortlistTop2(job.shortlistSnapshot);
    if (!shortlistParsed.ok) {
      throw new NotFoundException("pairwise job shortlist invalid");
    }

    let decision: AiPairwiseDecision | null = null;
    if (job.decisionResult != null && typeof job.decisionResult === "object") {
      const d = parseAndValidateAiPairwiseDecision(job.decisionResult);
      decision = d.ok ? d.value : null;
    }

    let shadow = parseStoredFinalSourceShadowRecord(job.finalSourceShadow);
    if (!shadow) {
      shadow = buildPairwiseFinalSourceShadowRecord({
        pairwiseJobId: job.id,
        viewerUserId: job.viewerUserId,
        poolId: job.poolId,
        shortlist: shortlistParsed.value,
        decision,
        jobStatus: job.status === AI_PAIRWISE_DECISION_JOB_STATUS.SUCCEEDED ? "succeeded" : "failed",
      });
    }

    const meta = buildFinalMatchDecisionMetaV1({
      sourceVersion: env.sourceVersion,
      mode: env.mode,
      pairwiseJobId: job.id,
      shadow,
    });

    await this.prisma.pairwisePoolFinalizeMeta.create({
      data: {
        viewerUserId: params.viewerUserId,
        poolId: params.poolId,
        pairwiseJobId: job.id,
        meta: meta as unknown as Prisma.InputJsonValue,
        frozen: true,
        frozenAt: new Date(),
      },
    });

    return { ok: true, status: "finalized", finalMatchDecisionMeta: meta };
  }
}
