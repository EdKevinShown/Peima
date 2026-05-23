import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  RRM_EVAL_DEFAULT_LIMIT,
  RRM_EVAL_DEFAULT_SINCE_DAYS,
  RRM_EVAL_MAX_LIMIT,
  RRM_EVAL_MAX_SINCE_DAYS,
} from "./rrm-eval.constants";
import { parseRrmEvalSampleFromRow, type RrmEvalCollectorRow } from "./rrm-eval-sample.parser";
import { buildRrmEvalAggregate } from "./rrm-eval.aggregate";
import type { RrmEvalAggregateV1 } from "./rrm-eval.types";

export function parseRrmEvalLimitQuery(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return RRM_EVAL_DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException("limit must be a positive integer");
  }
  if (parsed < 1 || parsed > RRM_EVAL_MAX_LIMIT) {
    throw new BadRequestException(`limit must be between 1 and ${RRM_EVAL_MAX_LIMIT}`);
  }
  return parsed;
}

export function parseRrmEvalSinceDaysQuery(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return RRM_EVAL_DEFAULT_SINCE_DAYS;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException("sinceDays must be a positive integer");
  }
  if (parsed < 1 || parsed > RRM_EVAL_MAX_SINCE_DAYS) {
    throw new BadRequestException(`sinceDays must be between 1 and ${RRM_EVAL_MAX_SINCE_DAYS}`);
  }
  return parsed;
}

@Injectable()
export class RrmEvalCollectorService {
  constructor(private readonly prisma: PrismaService) {}

  async buildAggregate(query: {
    limit?: string;
    sinceDays?: string;
  }): Promise<RrmEvalAggregateV1> {
    const limit = parseRrmEvalLimitQuery(query.limit);
    const sinceDays = parseRrmEvalSinceDaysQuery(query.sinceDays);
    const since = new Date(Date.now() - sinceDays * 24 * 3600_000);

    const matchRows = await this.prisma.matchResult.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        userId: true,
        candidateUserId: true,
        matchInsights: true,
        conversations: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            viewerUserId: true,
            candidateUserId: true,
            messages: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              take: 200,
              select: {
                senderUserId: true,
                content: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    const conversationIds = matchRows
      .map((r) => r.conversations[0]?.id)
      .filter((id): id is string => typeof id === "string");

    const feedbackByConversation = new Map<
      string,
      Array<{ rating: number | null; tags: string[]; structuredPayload: unknown }>
    >();

    if (conversationIds.length > 0) {
      const feedbackRows = await this.prisma.userFeedback.findMany({
        where: {
          subjectKind: "conversation",
          subjectId: { in: conversationIds },
        },
        select: {
          subjectId: true,
          rating: true,
          tags: true,
          structuredPayload: true,
        },
      });
      for (const fb of feedbackRows) {
        const list = feedbackByConversation.get(fb.subjectId) ?? [];
        list.push({
          rating: fb.rating,
          tags: fb.tags,
          structuredPayload: fb.structuredPayload,
        });
        feedbackByConversation.set(fb.subjectId, list);
      }
    }

    const samples = matchRows.map((row) => {
      const conv = row.conversations[0] ?? null;
      const collectorRow: RrmEvalCollectorRow = {
        matchInsights: row.matchInsights,
        candidateUserId: row.candidateUserId,
        conversation: conv
          ? {
              viewerUserId: conv.viewerUserId,
              counterpartyUserId: conv.candidateUserId,
              messages: conv.messages,
            }
          : null,
        feedbacks: conv ? (feedbackByConversation.get(conv.id) ?? []) : [],
      };
      return parseRrmEvalSampleFromRow(collectorRow);
    });

    return buildRrmEvalAggregate({
      samples,
      limit,
      sinceDays,
    });
  }
}
