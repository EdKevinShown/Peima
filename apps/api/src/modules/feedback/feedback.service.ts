import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { assertValidP612StructuredPayloadV0 } from "./p612-structured-payload-v0.validate";
import { FeedbackRepository } from "./feedback.repository";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";
import type { FeedbackRecordResponse } from "./dto/feedback-record-response.dto";

/** Safety cap for GET /feedback/mine (no cursor pagination in P2 v1). */
const MINE_FEEDBACK_MAX_ROWS = 200;

@Injectable()
export class FeedbackService {
  constructor(private readonly feedbackRepo: FeedbackRepository) {}

  async create(
    dto: CreateFeedbackDto,
    tokenUserId: string,
  ): Promise<FeedbackRecordResponse> {
    if (dto.userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }

    const recordedAt = dto.recordedAt
      ? new Date(dto.recordedAt)
      : new Date();

    const comment =
      dto.comment !== undefined && dto.comment.trim().length > 0
        ? dto.comment.trim()
        : null;

    const hasStruct =
      dto.structuredPayload != null && typeof dto.structuredPayload === "object";

    let rating: number | null = dto.rating ?? null;
    let structuredPayload: ReturnType<typeof assertValidP612StructuredPayloadV0> | null =
      null;

    if (hasStruct) {
      structuredPayload = assertValidP612StructuredPayloadV0(
        dto.structuredPayload,
        {
          subjectKind: dto.subjectKind,
          subjectId: dto.subjectId,
          sourceType: dto.sourceType,
          sourceVersion: dto.sourceVersion,
        },
      );
      const overall = (
        structuredPayload as Record<string, unknown>
      ).overallRating;
      if (typeof overall !== "number") {
        throw new BadRequestException("P6.12: overallRating missing after validate");
      }
      if (rating != null && rating !== overall) {
        throw new BadRequestException(
          "rating must match structuredPayload.overallRating when both are sent",
        );
      }
      rating = overall;
    }

    return this.feedbackRepo.create({
      userId: tokenUserId,
      subjectKind: dto.subjectKind,
      subjectId: dto.subjectId,
      sourceType: dto.sourceType,
      sourceVersion: dto.sourceVersion,
      rating,
      tags: dto.tags ?? [],
      comment,
      structuredPayload: structuredPayload ?? undefined,
      recordedAt,
    });
  }

  listMine(tokenUserId: string): Promise<FeedbackRecordResponse[]> {
    return this.feedbackRepo.findByUserId(tokenUserId, MINE_FEEDBACK_MAX_ROWS);
  }
}
