import { Module } from "@nestjs/common";
import { FriendsModule } from "../friends/friends.module";
import { ProfileSuggestionModule } from "../profile-suggestion/profile-suggestion.module";
import { RrmObservedReadonlyService } from "../rrm-observed";
import { RrmAssistantReadonlyService } from "../rrm-assistant/rrm-assistant-readonly.service";
import { RrmTimelineReadonlyService } from "../rrm-timeline";
import { ChatController } from "./chat.controller";
import { ChatTimelineController } from "./chat-timeline.controller";
import { ChatService } from "./chat.service";
import { ChatSummaryRepository } from "./chat-summary.repository";
import { ChatSummaryService } from "./chat-summary.service";
import { ConversationProfileCompletionAiConfigService } from "./conversation-profile-completion-ai.config.service";
import { ConversationProfileCompletionChatCompletionsClient } from "./conversation-profile-completion-chat-completions.client";
import { ConversationProfileCompletionService } from "./conversation-profile-completion.service";

@Module({
  imports: [ProfileSuggestionModule, FriendsModule],
  controllers: [ChatController, ChatTimelineController],
  providers: [
    ChatService,
    RrmObservedReadonlyService,
    RrmAssistantReadonlyService,
    RrmTimelineReadonlyService,
    ChatSummaryRepository,
    ChatSummaryService,
    ConversationProfileCompletionAiConfigService,
    ConversationProfileCompletionChatCompletionsClient,
    ConversationProfileCompletionService,
  ],
  exports: [ChatService, ChatSummaryService],
})
export class ChatModule {}
