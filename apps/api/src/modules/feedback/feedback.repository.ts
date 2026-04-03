import { Injectable } from "@nestjs/common";
import type { UserFeedback } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class FeedbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: string;
    subjectKind: string;
    subjectId: string;
    sourceType: string;
    sourceVersion: string;
    rating: number | null;
    tags: string[];
    comment: string | null;
    recordedAt: Date;
  }): Promise<UserFeedback> {
    return this.prisma.userFeedback.create({ data });
  }

  findByUserId(userId: string, take: number): Promise<UserFeedback[]> {
    return this.prisma.userFeedback.findMany({
      where: { userId },
      orderBy: { recordedAt: "desc" },
      take,
    });
  }
}
