export const FRIENDSHIP_SOURCE_MATCH_AUTO = "match_auto" as const;

export type EnsureUserFriendshipInput = {
  userId: string;
  friendUserId: string;
  source: string;
  matchResultId?: string | null;
};

export type FriendshipPrismaClient = {
  userFriendship: {
    upsert: (args: {
      where: { userId_friendUserId: { userId: string; friendUserId: string } };
      create: {
        userId: string;
        friendUserId: string;
        source: string;
        matchResultId: string | null;
      };
      update: Record<string, unknown>;
    }) => Promise<unknown>;
  };
};

export async function ensureUserFriendship(
  prisma: FriendshipPrismaClient,
  input: EnsureUserFriendshipInput,
): Promise<void> {
  const userId = input.userId.trim();
  const friendUserId = input.friendUserId.trim();
  if (!userId || !friendUserId || userId === friendUserId) {
    return;
  }

  await prisma.userFriendship.upsert({
    where: {
      userId_friendUserId: { userId, friendUserId },
    },
    create: {
      userId,
      friendUserId,
      source: input.source,
      matchResultId: input.matchResultId ?? null,
    },
    update: {
      source: input.source,
      ...(input.matchResultId != null
        ? { matchResultId: input.matchResultId }
        : {}),
    },
  });
}

export async function ensureBidirectionalFriendship(
  prisma: FriendshipPrismaClient,
  userA: string,
  userB: string,
  opts: { source: string; matchResultId?: string | null },
): Promise<void> {
  await ensureUserFriendship(prisma, {
    userId: userA,
    friendUserId: userB,
    source: opts.source,
    matchResultId: opts.matchResultId,
  });
  await ensureUserFriendship(prisma, {
    userId: userB,
    friendUserId: userA,
    source: opts.source,
    matchResultId: opts.matchResultId,
  });
}
