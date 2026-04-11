import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { SummaryAiChatCompletionsClient } from "./summary-ai-chat-completions.client";
import { SummaryAiConfigService } from "./summary-ai.config.service";
import { SummaryAiController } from "./summary-ai.controller";
import { SummaryAiService } from "./summary-ai.service";

@Module({
  imports: [ChatModule],
  controllers: [SummaryAiController],
  providers: [
    SummaryAiConfigService,
    SummaryAiChatCompletionsClient,
    SummaryAiService,
  ],
})
export class SummaryAiModule {}
