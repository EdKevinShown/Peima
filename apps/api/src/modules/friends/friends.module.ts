import { Module } from "@nestjs/common";
import { FriendsController } from "./friends.controller";
import { FriendshipService } from "./friendship.service";

@Module({
  controllers: [FriendsController],
  providers: [FriendshipService],
  exports: [FriendshipService],
})
export class FriendsModule {}
