import { Module } from "@nestjs/common";
import { MatchExplanationAiChatCompletionsClient } from "./match-explanation-ai-chat-completions.client";
import { MatchExplanationAiConfigService } from "./match-explanation-ai.config.service";
import { MatchExplanationAiController } from "./match-explanation-ai.controller";
import { MatchExplanationAiService } from "./match-explanation-ai.service";

@Module({
  controllers: [MatchExplanationAiController],
  providers: [
    MatchExplanationAiConfigService,
    MatchExplanationAiChatCompletionsClient,
    MatchExplanationAiService,
  ],
})
export class MatchExplanationAiModule {}
