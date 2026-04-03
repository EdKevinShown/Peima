import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { ChatSummaryRepository } from "./chat-summary.repository";
import { ChatSummaryService } from "./chat-summary.service";

@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatSummaryRepository, ChatSummaryService],
  exports: [ChatService],
})
export class ChatModule {}
