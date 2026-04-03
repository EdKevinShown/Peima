import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Prisma } from "@peima/database";
import { CreateBehaviorSignalDto } from "./dto/create-behavior-signal.dto";
import { BehaviorSignalRepository } from "./behavior-signal.repository";
import { PrismaService } from "../../common/prisma/prisma.service";

const MINE_MAX_ROWS = 200;

@Injectable()
export class BehaviorSignalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BehaviorSignalRepository,
  ) {}

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  async create(dto: CreateBehaviorSignalDto, tokenUserId: string) {
    if (dto.userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    await this.ensureUserExists(tokenUserId);

    const occurredAt = dto.occurredAt
      ? new Date(dto.occurredAt)
      : new Date();

    const properties = dto.properties as Prisma.InputJsonValue | undefined;

    return this.repo.create({
      userId: tokenUserId,
      eventType: dto.eventType,
      sourceType: dto.sourceType,
      sourceVersion: dto.sourceVersion,
      occurredAt,
      conversationId: dto.conversationId ?? null,
      sessionId: dto.sessionId?.trim() ? dto.sessionId.trim() : null,
      ...(properties !== undefined ? { properties } : {}),
    });
  }

  listMine(tokenUserId: string) {
    return this.repo.findByUserId(tokenUserId, MINE_MAX_ROWS);
  }
}
