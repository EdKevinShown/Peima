import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { AiPairwiseDecisionConfigService } from "./ai-pairwise-decision.config.service";
import { AiPairwiseDecisionLlmClient } from "./ai-pairwise-decision-llm.client";
import { AiPairwiseDecisionJobService } from "./ai-pairwise-decision-job.service";
import { AiPairwiseDecisionService } from "./ai-pairwise-decision.service";
import { AiPairwiseTop2ShortlistService } from "./ai-pairwise-top2-shortlist.service";
import { AiPairwiseDecisionViewerController } from "./ai-pairwise-decision-viewer.controller";

@Module({
  imports: [PrismaModule],
  controllers: [AiPairwiseDecisionViewerController],
  providers: [
    AiPairwiseDecisionConfigService,
    AiPairwiseDecisionLlmClient,
    AiPairwiseDecisionService,
    AiPairwiseDecisionJobService,
    AiPairwiseTop2ShortlistService,
  ],
  exports: [
    AiPairwiseDecisionService,
    AiPairwiseDecisionJobService,
    AiPairwiseTop2ShortlistService,
    AiPairwiseDecisionConfigService,
  ],
})
export class AiPairwiseDecisionModule {}
