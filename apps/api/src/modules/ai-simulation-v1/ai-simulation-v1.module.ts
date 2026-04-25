import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { QuestionnaireModule } from "../questionnaire/questionnaire.module";
import { AiSimulationV1ChatClient } from "./ai-simulation-v1-chat.client";
import { AiSimulationV1ConfigService } from "./ai-simulation-v1.config.service";
import { AiSimulationV1Service } from "./ai-simulation-v1.service";

@Module({
  imports: [PrismaModule, QuestionnaireModule],
  providers: [AiSimulationV1ConfigService, AiSimulationV1ChatClient, AiSimulationV1Service],
  exports: [AiSimulationV1Service],
})
export class AiSimulationV1Module {}
