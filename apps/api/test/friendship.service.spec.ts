import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { FriendshipService } from "../src/modules/friends/friendship.service";

describe("FriendshipService", () => {
  it("lists friends with nicknames", async () => {
    const prisma = {
      matchResult: { findMany: jest.fn().mockResolvedValue([]) },
      userFriendship: {
        findMany: jest.fn().mockResolvedValue([
          {
            friendUserId: "u2",
            source: "match_auto",
            matchResultId: "mr1",
            createdAt: new Date(),
            friend: { id: "u2", nickname: "用户二" },
          },
        ]),
        upsert: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        FriendshipService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    const svc = moduleRef.get(FriendshipService);
    const rows = await svc.listFriends("u1");
    expect(rows).toEqual([
      expect.objectContaining({
        friendUserId: "u2",
        nickname: "用户二",
        source: "match_auto",
      }),
    ]);
  });
});
