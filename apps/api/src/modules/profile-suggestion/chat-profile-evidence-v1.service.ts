import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@peima/database";
import type { DimensionBranchChatHintItem } from "../questionnaire/dimension-branch-chat-hints";
import {
  clampEvidenceWeight,
  freshnessFromMinutesSinceLastActivity,
  sessionQualityFromMessageCount,
} from "./chat-profile-evidence-v1.weights";
import {
  recalcEffectiveProfileChatOverlayV1,
  type ChatProfileEvidenceRowInput,
} from "./chat-profile-effective-overlay-v1.recalc";

@Injectable()
export class ChatProfileEvidenceV1Service {
  /**
   * P6.8 accept：为每条轴写入 / 幂等更新聊天证据，并重算 `effectiveProfileChatOverlayV1`。
   * 需在同一事务内调用；不改变问卷答案真源。
   */
  async upsertEvidenceAndRecomputeOverlay(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      conversationId: string;
      suggestionId: string;
      sourceVersion: string;
      acceptedAt: Date;
      items: ReadonlyArray<DimensionBranchChatHintItem>;
    },
  ): Promise<void> {
    const conv = await tx.conversation.findUnique({
      where: { id: params.conversationId },
      select: { id: true, createdAt: true },
    });
    if (!conv) {
      throw new UnprocessableEntityException(
        `conversation ${params.conversationId} not found for chat evidence`,
      );
    }

    const messageCount = await tx.message.count({
      where: { conversationId: params.conversationId },
    });
    const lastMsg = await tx.message.findFirst({
      where: { conversationId: params.conversationId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const lastActivityAt = lastMsg?.createdAt ?? conv.createdAt;
    const minutesFresh =
      (params.acceptedAt.getTime() - lastActivityAt.getTime()) / 60_000;
    const sq = sessionQualityFromMessageCount(messageCount);
    const fr = freshnessFromMinutesSinceLastActivity(minutesFresh);
    const evidenceWeight = clampEvidenceWeight(sq.weight, fr.weight);

    for (const it of params.items) {
      await tx.chatProfileEvidence.upsert({
        where: {
          userId_conversationId_axisId: {
            userId: params.userId,
            conversationId: params.conversationId,
            axisId: it.axisId,
          },
        },
        create: {
          userId: params.userId,
          conversationId: params.conversationId,
          axisId: it.axisId,
          branch: it.branch,
          acceptedAt: params.acceptedAt,
          sourceVersion: params.sourceVersion,
          suggestionId: params.suggestionId,
          acceptedByUser: true,
          sessionQualityBucket: sq.bucket,
          sessionQualityWeight: sq.weight,
          freshnessBucket: fr.bucket,
          freshnessWeight: fr.weight,
          evidenceWeight,
        },
        update: {
          branch: it.branch,
          acceptedAt: params.acceptedAt,
          sourceVersion: params.sourceVersion,
          suggestionId: params.suggestionId,
          sessionQualityBucket: sq.bucket,
          sessionQualityWeight: sq.weight,
          freshnessBucket: fr.bucket,
          freshnessWeight: fr.weight,
          evidenceWeight,
          revokedAt: null,
        },
      });
    }

    await this.recomputeOverlayOnly(tx, params.userId);
  }

  async recomputeOverlayOnly(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const [answers, evidences] = await Promise.all([
      tx.questionnaireAnswer.findMany({
        where: { userId },
        orderBy: { updatedAt: "asc" },
      }),
      tx.chatProfileEvidence.findMany({
        where: { userId, revokedAt: null },
      }),
    ]);

    const evRows: ChatProfileEvidenceRowInput[] = evidences.map((e) => ({
      conversationId: e.conversationId,
      axisId: e.axisId,
      branch: e.branch,
      evidenceWeight: e.evidenceWeight,
      acceptedAt: e.acceptedAt,
    }));

    const overlay = recalcEffectiveProfileChatOverlayV1({
      answers: answers.map((a) => ({
        questionKey: a.questionKey,
        answerValue: a.answerValue,
      })),
      evidences: evRows,
      computedAt: new Date(),
    });

    await tx.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        effectiveProfileChatOverlayV1: overlay as Prisma.InputJsonValue,
      },
      update: {
        effectiveProfileChatOverlayV1: overlay as Prisma.InputJsonValue,
      },
    });
  }
}
