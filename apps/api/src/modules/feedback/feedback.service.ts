import { Injectable, UnauthorizedException } from "@nestjs/common";
import { FeedbackRepository } from "./feedback.repository";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";

/** Safety cap for GET /feedback/mine (no cursor pagination in P2 v1). */
const MINE_FEEDBACK_MAX_ROWS = 200;

@Injectable()
export class FeedbackService {
  constructor(private readonly feedbackRepo: FeedbackRepository) {}

  async create(dto: CreateFeedbackDto, tokenUserId: string) {
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

    return this.feedbackRepo.create({
      userId: tokenUserId,
      subjectKind: dto.subjectKind,
      subjectId: dto.subjectId,
      sourceType: dto.sourceType,
      sourceVersion: dto.sourceVersion,
      rating: dto.rating ?? null,
      tags: dto.tags ?? [],
      comment,
      recordedAt,
    });
  }

  listMine(tokenUserId: string) {
    return this.feedbackRepo.findByUserId(tokenUserId, MINE_FEEDBACK_MAX_ROWS);
  }
}
