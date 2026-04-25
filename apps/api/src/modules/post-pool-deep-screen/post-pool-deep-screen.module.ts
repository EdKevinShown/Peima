import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { AiSimulationV1Module } from "../ai-simulation-v1/ai-simulation-v1.module";
import { PrescreenV0Module } from "../prescreen-v0/prescreen-v0.module";
import { PostPoolDeepScreenOrchestratorService } from "./post-pool-deep-screen-orchestrator.service";

@Module({
  imports: [PrismaModule, PrescreenV0Module, AiSimulationV1Module],
  providers: [PostPoolDeepScreenOrchestratorService],
  exports: [PostPoolDeepScreenOrchestratorService],
})
export class PostPoolDeepScreenModule {}
