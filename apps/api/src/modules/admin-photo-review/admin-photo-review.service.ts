import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PHOTO_REVIEW_ACTION_SOURCE_STATUSES } from "./admin-photo-review.constants";
import {
  buildApproveWrite,
  buildNeedsReuploadWrite,
  buildRejectWrite,
  type ReviewWritePayload,
} from "./admin-photo-review-write";
import {
  buildDetectionSummary,
  rowHasWarnings,
} from "./admin-photo-review-detection-summary";
import type { ListPhotoReviewItemsQueryDto } from "./dto/list-photo-review-items-query.dto";
import type {
  AdminPhotoReviewDetailDto,
  AdminPhotoReviewListItemDto,
  AdminPhotoReviewListResponseDto,
} from "./dto/photo-review-item.dto";
import type { ReviewPhotoApproveDto } from "./dto/review-photo-action.dto";
import type { ReviewPhotoActionWithReasonsDto } from "./dto/review-photo-action.dto";

const DEFAULT_REVIEW_STATUS = "pending_review";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const HAS_WARNINGS_FETCH_MULTIPLIER = 5;

type UserImageRow = {
  id: string;
  userId: string;
  imageUrl: string;
  detectionStatus: string;
  detectionReasonCodes: string[];
  detectionScoreJson: unknown;
  detectionRulesVersion: string | null;
  detectedAt: Date | null;
  reviewStatus: string;
  reviewReasonCodes: string[];
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

function decodeCursor(
  cursor: string,
): { createdAt: Date; id: string } | null {
  const sep = cursor.indexOf("|");
  if (sep < 0) {
    return null;
  }
  const createdAt = new Date(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) {
    return null;
  }
  return { createdAt, id };
}

function toListItem(row: UserImageRow): AdminPhotoReviewListItemDto {
  return {
    imageId: row.id,
    userId: row.userId,
    imageUrl: row.imageUrl,
    detectionStatus: row.detectionStatus,
    detectionReasonCodes: row.detectionReasonCodes,
    detectionRulesVersion: row.detectionRulesVersion,
    detectedAt: row.detectedAt,
    reviewStatus: row.reviewStatus,
    reviewReasonCodes: row.reviewReasonCodes,
    reviewedAt: row.reviewedAt,
    reviewedByUserId: row.reviewedByUserId,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    detectionSummary: buildDetectionSummary(row.detectionScoreJson),
  };
}

@Injectable()
export class AdminPhotoReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async listItems(
    query: ListPhotoReviewItemsQueryDto,
  ): Promise<AdminPhotoReviewListResponseDto> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const reviewStatus = query.reviewStatus ?? DEFAULT_REVIEW_STATUS;
    const where = this.buildListWhere(query, reviewStatus);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    if (query.cursor && !cursor) {
      return { items: [], nextCursor: null };
    }

    const needsWarningFilter = query.hasWarnings !== undefined;
    const fetchTake = needsWarningFilter
      ? Math.min(limit * HAS_WARNINGS_FETCH_MULTIPLIER, MAX_LIMIT)
      : limit + 1;

    const rows = await this.prisma.userImage.findMany({
      where: {
        ...where,
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                {
                  AND: [
                    { createdAt: cursor.createdAt },
                    { id: { gt: cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: fetchTake,
      select: {
        id: true,
        userId: true,
        imageUrl: true,
        detectionStatus: true,
        detectionReasonCodes: true,
        detectionScoreJson: true,
        detectionRulesVersion: true,
        detectedAt: true,
        reviewStatus: true,
        reviewReasonCodes: true,
        reviewedAt: true,
        reviewedByUserId: true,
        reviewNote: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    let filtered = rows as UserImageRow[];
    if (needsWarningFilter) {
      filtered = filtered.filter((row) =>
        query.hasWarnings
          ? rowHasWarnings(row.detectionScoreJson)
          : !rowHasWarnings(row.detectionScoreJson),
      );
    }

    const page = filtered.slice(0, limit);
    const hasMore =
      filtered.length > limit ||
      (!needsWarningFilter && rows.length > limit);
    const items = page.map(toListItem);
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    return { items, nextCursor };
  }

  async approveItem(
    imageId: string,
    actorUserId: string,
    dto: ReviewPhotoApproveDto,
  ): Promise<AdminPhotoReviewDetailDto> {
    return this.applyReviewAction(
      imageId,
      actorUserId,
      buildApproveWrite(dto),
    );
  }

  async rejectItem(
    imageId: string,
    actorUserId: string,
    dto: ReviewPhotoActionWithReasonsDto,
  ): Promise<AdminPhotoReviewDetailDto> {
    return this.applyReviewAction(
      imageId,
      actorUserId,
      buildRejectWrite(dto),
    );
  }

  async needsReuploadItem(
    imageId: string,
    actorUserId: string,
    dto: ReviewPhotoActionWithReasonsDto,
  ): Promise<AdminPhotoReviewDetailDto> {
    return this.applyReviewAction(
      imageId,
      actorUserId,
      buildNeedsReuploadWrite(dto),
    );
  }

  async getItemDetail(imageId: string): Promise<AdminPhotoReviewDetailDto> {
    const row = await this.prisma.userImage.findUnique({
      where: { id: imageId },
      include: {
        user: {
          select: { id: true, nickname: true },
        },
      },
    });
    if (!row) {
      throw new NotFoundException(`Photo review item ${imageId} not found`);
    }

    const base = toListItem(row as UserImageRow);
    return {
      ...base,
      detectionScoreJson: row.detectionScoreJson,
      user: {
        userId: row.user.id,
        nickname: row.user.nickname,
      },
    };
  }

  private async applyReviewAction(
    imageId: string,
    actorUserId: string,
    write: ReviewWritePayload,
  ): Promise<AdminPhotoReviewDetailDto> {
    const existing = await this.prisma.userImage.findUnique({
      where: { id: imageId },
      select: { id: true, updatedAt: true, reviewStatus: true },
    });
    if (!existing) {
      throw new NotFoundException(`Photo review item ${imageId} not found`);
    }

    const reviewedAt = new Date();
    const updated = await this.prisma.userImage.updateMany({
      where: {
        id: imageId,
        updatedAt: existing.updatedAt,
        reviewStatus: { in: [...PHOTO_REVIEW_ACTION_SOURCE_STATUSES] },
      },
      data: {
        reviewStatus: write.reviewStatus,
        reviewReasonCodes: write.reviewReasonCodes,
        reviewNote: write.reviewNote,
        reviewedAt,
        reviewedByUserId: actorUserId,
      },
    });

    if (updated.count !== 1) {
      const current = await this.prisma.userImage.findUnique({
        where: { id: imageId },
        select: { reviewStatus: true },
      });
      if (!current) {
        throw new NotFoundException(`Photo review item ${imageId} not found`);
      }
      throw new ConflictException(
        `Photo review item ${imageId} could not be updated (status=${current.reviewStatus}); retry or refresh`,
      );
    }

    return this.getItemDetail(imageId);
  }

  private buildListWhere(
    query: ListPhotoReviewItemsQueryDto,
    reviewStatus: string,
  ): Prisma.UserImageWhereInput {
    const where: Prisma.UserImageWhereInput = { reviewStatus };

    if (query.detectionStatus) {
      where.detectionStatus = query.detectionStatus;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.createdAfter || query.createdBefore) {
      where.createdAt = {};
      if (query.createdAfter) {
        where.createdAt.gte = new Date(query.createdAfter);
      }
      if (query.createdBefore) {
        where.createdAt.lte = new Date(query.createdBefore);
      }
    }
    if (query.reasonCode) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { detectionReasonCodes: { has: query.reasonCode } },
            { reviewReasonCodes: { has: query.reasonCode } },
          ],
        },
      ];
    }

    return where;
  }
}
