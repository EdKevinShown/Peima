import {
  BadRequestException,
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

  async accept(suggestionId: string, tokenUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.profileUpdateSuggestion.findFirst({
        where: {
          id: suggestionId,
          userId: tokenUserId,
          status: P2SuggestionStatus.Pending,
        },
      });

      if (!row) {
        const any = await tx.profileUpdateSuggestion.findFirst({
          where: { id: suggestionId, userId: tokenUserId },
        });
        if (!any) {
          throw new NotFoundException(
            `Suggestion ${suggestionId} not found`,
          );
        }
        throw new BadRequestException(
          "suggestion is not pending",
        );
      }

      const patch = parseProfileProposedPatch(row.proposedPatch);

      await tx.profileUpdateSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: P2SuggestionStatus.Accepted,
          resolvedAt: new Date(),
        },
      });

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
      const row = await tx.profileUpdateSuggestion.findFirst({
        where: {
          id: suggestionId,
          userId: tokenUserId,
          status: P2SuggestionStatus.Pending,
        },
      });

      if (!row) {
        const any = await tx.profileUpdateSuggestion.findFirst({
          where: { id: suggestionId, userId: tokenUserId },
        });
        if (!any) {
          throw new NotFoundException(
            `Suggestion ${suggestionId} not found`,
          );
        }
        throw new BadRequestException(
          "suggestion is not pending",
        );
      }

      await tx.profileUpdateSuggestion.update({
        where: { id: suggestionId },
        data: {
          status: P2SuggestionStatus.Dismissed,
          resolvedAt: new Date(),
        },
      });

      return tx.profileUpdateSuggestion.findUniqueOrThrow({
        where: { id: suggestionId },
      });
    });
  }
}
