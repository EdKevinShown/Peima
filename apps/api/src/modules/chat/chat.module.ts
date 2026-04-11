import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatTimelineController } from "./chat-timeline.controller";
import { ChatService } from "./chat.service";
import { ChatSummaryRepository } from "./chat-summary.repository";
import { ChatSummaryService } from "./chat-summary.service";

@Module({
  controllers: [ChatController, ChatTimelineController],
  providers: [ChatService, ChatSummaryRepository, ChatSummaryService],
  exports: [ChatService, ChatSummaryService],
})
export class ChatModule {}
