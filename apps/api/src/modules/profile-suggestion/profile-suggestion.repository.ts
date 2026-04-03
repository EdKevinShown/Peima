import { Injectable } from "@nestjs/common";
import type { Prisma, ProfileUpdateSuggestion } from "@peima/database";
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
  }): Promise<ProfileUpdateSuggestion> {
    return this.prisma.profileUpdateSuggestion.create({ data });
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
