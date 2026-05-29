import { Controller, Get, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { FriendshipService, type FriendListItem } from "./friendship.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("friends")
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendshipService: FriendshipService) {}

  @Get("me")
  listMyFriends(@Req() req: JwtReq): Promise<FriendListItem[]> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.friendshipService.listFriends(userId);
  }
}
