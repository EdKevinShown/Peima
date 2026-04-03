import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { CopilotController } from "./copilot.controller";
import { CopilotRepository } from "./copilot.repository";
import { CopilotService } from "./copilot.service";

@Module({
  imports: [ChatModule],
  controllers: [CopilotController],
  providers: [CopilotService, CopilotRepository],
})
export class CopilotModule {}
