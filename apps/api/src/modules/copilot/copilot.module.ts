import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { CopilotAiConfigService } from "./copilot-ai.config.service";
import { CopilotChatCompletionsClient } from "./copilot-chat-completions.client";
import { CopilotController } from "./copilot.controller";
import { CopilotRepository } from "./copilot.repository";
import { CopilotService } from "./copilot.service";

@Module({
  imports: [ChatModule],
  controllers: [CopilotController],
  providers: [
    CopilotService,
    CopilotRepository,
    CopilotAiConfigService,
    CopilotChatCompletionsClient,
  ],
})
export class CopilotModule {}
