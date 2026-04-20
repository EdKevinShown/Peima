import { Injectable } from "@nestjs/common";
import type { Prisma, ProfileUpdateSuggestion } from "@peima/database";
import { P2SuggestionStatus } from "@peima/shared/constants";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class ProfileSuggestionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: string;
    status: string;
    sourceType: string;
    sourceVersion: string;
    proposedPatch: Prisma.InputJsonValue;
    sourceConversationId?: string | null;
  }): Promise<ProfileUpdateSuggestion> {
    return this.prisma.profileUpdateSuggestion.create({ data });
  }

  findPendingP6ChatProfileCompletionForConversation(params: {
    userId: string;
    sourceConversationId: string;
    sourceVersion: string;
  }): Promise<ProfileUpdateSuggestion | null> {
    return this.prisma.profileUpdateSuggestion.findFirst({
      where: {
        userId: params.userId,
        sourceConversationId: params.sourceConversationId,
        sourceVersion: params.sourceVersion,
        status: P2SuggestionStatus.Pending,
      },
    });
  }

  findByUserId(
    userId: string,
    take: number,
  ): Promise<ProfileUpdateSuggestion[]> {
    return this.prisma.profileUpdateSuggestion.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }
}
