import { Injectable } from "@nestjs/common";
import type { BehaviorSignal, Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class BehaviorSignalRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: string;
    eventType: string;
    sourceType: string;
    sourceVersion: string;
    occurredAt: Date;
    conversationId: string | null;
    sessionId: string | null;
    properties?: Prisma.InputJsonValue;
  }): Promise<BehaviorSignal> {
    return this.prisma.behaviorSignal.create({
      data: {
        userId: data.userId,
        eventType: data.eventType,
        sourceType: data.sourceType,
        sourceVersion: data.sourceVersion,
        occurredAt: data.occurredAt,
        conversationId: data.conversationId,
        sessionId: data.sessionId,
        ...(data.properties !== undefined ? { properties: data.properties } : {}),
      },
    });
  }

  findByUserId(userId: string, take: number): Promise<BehaviorSignal[]> {
    return this.prisma.behaviorSignal.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      take,
    });
  }
}
