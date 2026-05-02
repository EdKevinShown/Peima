import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { BatchMatchQueue, MatchResult } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EnqueueMatchDto } from "./dto/enqueue-match.dto";
import { resolveMatchResultDisplay, type MatchResultDisplayFields } from "./matching-result-display";

export type MatchStatusPayload = {
  status: "not_queued" | "waiting" | "processing" | "ready";
};

/** M3.8-M13: `GET /matching/result` — Prisma row + display sidecar fields. */
export type MatchResultViewerPayload = MatchResult & MatchResultDisplayFields;

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  async enqueue(dto: EnqueueMatchDto): Promise<BatchMatchQueue> {
    await this.ensureUserExists(dto.userId);

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: dto.userId },
    });
    if (!profile) {
      throw new BadRequestException(
        "User must complete the questionnaire before joining the match queue",
      );
    }

    const existing = await this.prisma.batchMatchQueue.findFirst({
      where: { userId: dto.userId, status: "waiting" },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.batchMatchQueue.create({
      data: {
        userId: dto.userId,
        status: "waiting",
      },
    });
  }

  async getStatusForUser(userId: string): Promise<MatchStatusPayload> {
    await this.ensureUserExists(userId);

    const latestResult = await this.prisma.matchResult.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    const latestQueue = await this.prisma.batchMatchQueue.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (!latestQueue) {
      return { status: latestResult ? "ready" : "not_queued" };
    }

    if (latestQueue.status === "waiting") {
      return { status: "waiting" };
    }
    if (latestQueue.status === "processing") {
      return { status: "processing" };
    }
    if (latestQueue.status === "matched") {
      return { status: "ready" };
    }

    if (latestResult) {
      return { status: "ready" };
    }
    return { status: "not_queued" };
  }

  async getLatestResultForUser(userId: string): Promise<MatchResultViewerPayload> {
    await this.ensureUserExists(userId);

    const result = await this.prisma.matchResult.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (!result) {
      throw new NotFoundException(`No match result for user ${userId}`);
    }
    const display = await resolveMatchResultDisplay(this.prisma, result);
    return { ...result, ...display };
  }
}
