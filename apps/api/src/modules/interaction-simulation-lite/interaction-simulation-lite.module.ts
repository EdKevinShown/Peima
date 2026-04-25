import { Module } from "@nestjs/common";
import { QuestionnaireModule } from "../questionnaire/questionnaire.module";
import { InteractionSimulationLiteChatCompletionsClient } from "./interaction-simulation-lite-chat-completions.client";
import { InteractionSimulationLiteConfigService } from "./interaction-simulation-lite.config.service";
import { InteractionSimulationLiteController } from "./interaction-simulation-lite.controller";
import { InteractionSimulationLiteService } from "./interaction-simulation-lite.service";

@Module({
  imports: [QuestionnaireModule],
  controllers: [InteractionSimulationLiteController],
  providers: [
    InteractionSimulationLiteConfigService,
    InteractionSimulationLiteChatCompletionsClient,
    InteractionSimulationLiteService,
  ],
})
export class InteractionSimulationLiteModule {}
