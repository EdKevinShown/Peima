import { Module } from "@nestjs/common";
import { MatchingModule } from "../matching/matching.module";
import { QuestionnaireModule } from "../questionnaire/questionnaire.module";
import { MatchReviewAiChatCompletionsClient } from "./match-review-ai-chat-completions.client";
import { MatchReviewAiConfigService } from "./match-review-ai.config.service";
import { MatchReviewAiController } from "./match-review-ai.controller";
import { MatchReviewAiService } from "./match-review-ai.service";

@Module({
  imports: [MatchingModule, QuestionnaireModule],
  controllers: [MatchReviewAiController],
  providers: [
    MatchReviewAiConfigService,
    MatchReviewAiChatCompletionsClient,
    MatchReviewAiService,
  ],
})
export class MatchReviewAiModule {}
