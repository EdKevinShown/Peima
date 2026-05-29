import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  ensureBidirectionalFriendship,
  FRIENDSHIP_SOURCE_MATCH_AUTO,
} from "./ensure-user-friendship";

export type FriendListItem = {
  friendUserId: string;
  nickname: string;
  source: string;
  matchResultId: string | null;
  createdAt: Date;
};

@Injectable()
export class FriendshipService {
  constructor(private readonly prisma: PrismaService) {}

  private friendshipPrisma() {
    return this.prisma as unknown as import("./ensure-user-friendship").FriendshipPrismaClient &
      Pick<PrismaService, "matchResult">;
  }

  async ensureMatchFriends(
    viewerUserId: string,
    candidateUserId: string,
    matchResultId?: string | null,
  ): Promise<void> {
    await ensureBidirectionalFriendship(
      this.friendshipPrisma(),
      viewerUserId,
      candidateUserId,
      {
        source: FRIENDSHIP_SOURCE_MATCH_AUTO,
        matchResultId: matchResultId ?? null,
      },
    );
  }

  async assertFriendship(userId: string, peerUserId: string): Promise<void> {
    const row = await this.friendshipPrisma().userFriendship.findUnique({
      where: {
        userId_friendUserId: { userId, friendUserId: peerUserId },
      },
    });
    if (!row) {
      throw new ForbiddenException(
        "只能与好友发起聊天，请先完成匹配或从好友列表选择",
      );
    }
  }

  /** Backfill friends from historical match rows (viewer or candidate). */
  async syncFriendsFromMatches(userId: string): Promise<void> {
    const rows = await this.prisma.matchResult.findMany({
      where: {
        status: "ready",
        OR: [{ userId }, { candidateUserId: userId }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        userId: true,
        candidateUserId: true,
      },
    });

    for (const row of rows) {
      const peer =
        row.userId === userId ? row.candidateUserId : row.userId;
      await this.ensureMatchFriends(userId, peer, row.id);
    }
  }

  async listFriends(userId: string): Promise<FriendListItem[]> {
    await this.syncFriendsFromMatches(userId);

    const rows = await this.friendshipPrisma().userFriendship.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        friend: { select: { id: true, nickname: true } },
      },
    });

    return rows.map((r) => ({
      friendUserId: r.friendUserId,
      nickname: r.friend.nickname,
      source: r.source,
      matchResultId: r.matchResultId,
      createdAt: r.createdAt,
    }));
  }
}
