import { Injectable } from "@nestjs/common";
import type { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { FeedbackRecordResponse } from "./dto/feedback-record-response.dto";

@Injectable()
export class FeedbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    userId: string;
    subjectKind: string;
    subjectId: string;
    sourceType: string;
    sourceVersion: string;
    rating: number | null;
    tags: string[];
    comment: string | null;
    structuredPayload?: Prisma.InputJsonValue | null;
    recordedAt: Date;
  }): Promise<FeedbackRecordResponse> {
    const { structuredPayload, ...rest } = data;
    const row = await this.prisma.userFeedback.create({
      data: {
        ...rest,
        ...(structuredPayload !== undefined && structuredPayload !== null
          ? { structuredPayload }
          : {}),
      },
    });
    return row as FeedbackRecordResponse;
  }

  async findByUserId(
    userId: string,
    take: number,
  ): Promise<FeedbackRecordResponse[]> {
    const rows = await this.prisma.userFeedback.findMany({
      where: { userId },
      orderBy: { recordedAt: "desc" },
      take,
    });
    return rows as FeedbackRecordResponse[];
  }
}
