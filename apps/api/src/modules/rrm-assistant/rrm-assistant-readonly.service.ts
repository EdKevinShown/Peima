import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { buildRrmObservedSignalSummary } from "../rrm-observed/rrm-observed.adapter";
import { buildRrmAssistantDraftAssessment } from "./rrm-assistant-draft.assessment";
import type { RrmAssistantDraftAssessmentHttpDto } from "./rrm-assistant-readonly.response";
import {
  RRM_ASSISTANT_READONLY_HTTP_SCHEMA_VERSION,
  toViewerActionFit,
} from "./rrm-assistant-readonly.response";
import { RRM_SOURCE_VERSION_ASSISTANT } from "../rrm-shared";

@Injectable()
export class RrmAssistantReadonlyService {
  constructor(private readonly prisma: PrismaService) {}

  async assessDraftForConversation(
    conversationId: string,
    tokenUserId: string,
    draft: string,
  ): Promise<RrmAssistantDraftAssessmentHttpDto> {
    const cid = conversationId.trim();
    const uid = tokenUserId.trim();
    if (!cid || !uid) {
      throw new NotFoundException("conversation not found");
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: cid },
      include: {
        messages: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            senderUserId: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${cid} not found`);
    }

    if (
      conversation.viewerUserId !== uid &&
      conversation.candidateUserId !== uid
    ) {
      throw new UnauthorizedException("conversation not accessible by this user");
    }

    const counterpartyUserId =
      uid === conversation.viewerUserId
        ? conversation.candidateUserId
        : conversation.viewerUserId;

    const observed = buildRrmObservedSignalSummary({
      conversationId: cid,
      viewerUserId: uid,
      counterpartyUserId,
      messages: conversation.messages.map((m) => ({
        senderUserId: m.senderUserId,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });

    const assessment = buildRrmAssistantDraftAssessment({
      draft,
      observedSummary: observed,
      simHint: null,
    });

    return {
      schemaVersion: RRM_ASSISTANT_READONLY_HTTP_SCHEMA_VERSION,
      sourceVersion: RRM_SOURCE_VERSION_ASSISTANT,
      mode: "readonly",
      appliedToMatchResult: false,
      appliedToFinalScore: false,
      appliedToWorkerRanking: false,
      conversationId: cid,
      participantUserId: uid,
      advancementDetected: assessment.detection.advancementDetected,
      A_draft_bucket: assessment.detection.A_draft_bucket,
      actionFit: toViewerActionFit(assessment),
      toneAdvice: assessment.toneAdvice,
      suggestedAction: assessment.suggestedAction,
    };
  }
}
