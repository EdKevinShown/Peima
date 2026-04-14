import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Prisma } from "@peima/database";
import { P2SuggestionStatus } from "@peima/shared/constants";
import { PrismaService } from "../../common/prisma/prisma.service";
import { parseProfileProposedPatch } from "./apply-profile-patch";
import type { CreateProfileSuggestionDto } from "./dto/create-profile-suggestion.dto";
import { ProfileSuggestionRepository } from "./profile-suggestion.repository";

const MINE_MAX_ROWS = 100;

@Injectable()
export class ProfileSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ProfileSuggestionRepository,
  ) {}

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  async create(dto: CreateProfileSuggestionDto, tokenUserId: string) {
    if (dto.userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    await this.ensureUserExists(tokenUserId);

    const proposedPatch = dto.proposedPatch as Prisma.InputJsonValue;

    return this.repo.create({
      userId: tokenUserId,
      status: P2SuggestionStatus.Pending,
      sourceType: dto.sourceType,
      sourceVersion: dto.sourceVersion,
      proposedPatch,
    });
  }

  listMine(tokenUserId: string) {
    return this.repo.findByUserId(tokenUserId, MINE_MAX_ROWS);
  }

  private async loadSuggestionForUserOrThrow(
    tx: Prisma.TransactionClient,
    suggestionId: string,
    tokenUserId: string,
  ) {
    const row = await tx.profileUpdateSuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!row || row.userId !== tokenUserId) {
      throw new NotFoundException(`Suggestion ${suggestionId} not found`);
    }

    return row;
  }

  async accept(suggestionId: string, tokenUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.loadSuggestionForUserOrThrow(
        tx,
        suggestionId,
        tokenUserId,
      );

      if (row.status !== P2SuggestionStatus.Pending) {
        throw new ConflictException("suggestion is not pending");
      }

      const patch = parseProfileProposedPatch(row.proposedPatch);
      const resolvedAt = new Date();

      const claimed = await tx.profileUpdateSuggestion.updateMany({
        where: {
          id: suggestionId,
          userId: tokenUserId,
          status: P2SuggestionStatus.Pending,
        },
        data: {
          status: P2SuggestionStatus.Accepted,
          resolvedAt,
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException("suggestion is not pending");
      }

      if (Object.keys(patch).length > 0) {
        await tx.userProfile.upsert({
          where: { userId: tokenUserId },
          create: {
            userId: tokenUserId,
            ...patch,
          },
          update: patch,
        });
      }

      return tx.profileUpdateSuggestion.findUniqueOrThrow({
        where: { id: suggestionId },
      });
    });
  }

  async dismiss(suggestionId: string, tokenUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.loadSuggestionForUserOrThrow(
        tx,
        suggestionId,
        tokenUserId,
      );

      if (row.status !== P2SuggestionStatus.Pending) {
        throw new ConflictException("suggestion is not pending");
      }

      const claimed = await tx.profileUpdateSuggestion.updateMany({
        where: {
          id: suggestionId,
          userId: tokenUserId,
          status: P2SuggestionStatus.Pending,
        },
        data: {
          status: P2SuggestionStatus.Dismissed,
          resolvedAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException("suggestion is not pending");
      }

      return tx.profileUpdateSuggestion.findUniqueOrThrow({
        where: { id: suggestionId },
      });
    });
  }
}
