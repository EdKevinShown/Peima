import { Module } from "@nestjs/common";
import { AiPairwiseDecisionModule } from "../ai-pairwise-decision/ai-pairwise-decision.module";
import { AiPairwiseDecisionAdminController } from "../ai-pairwise-decision/ai-pairwise-decision-admin.controller";
import { AiSimulationV1Module } from "../ai-simulation-v1/ai-simulation-v1.module";
import { PostPoolDeepScreenModule } from "../post-pool-deep-screen/post-pool-deep-screen.module";
import { PrescreenV0Module } from "../prescreen-v0/prescreen-v0.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { MatchingObservabilitySummaryService } from "./matching-observability-summary.service";
import { RrmObservationSummaryService } from "./rrm-observation-summary.service";
import { RrmEvalCollectorService } from "../rrm-eval";
import { AdminMyAiRecordsService } from "./admin-my-ai-records.service";

@Module({
  imports: [PrescreenV0Module, PostPoolDeepScreenModule, AiSimulationV1Module, AiPairwiseDecisionModule],
  controllers: [AdminController, AiPairwiseDecisionAdminController],
  providers: [
    AdminService,
    AdminMyAiRecordsService,
    RrmObservationSummaryService,
    MatchingObservabilitySummaryService,
    RrmEvalCollectorService,
  ],
  exports: [AdminService],
})
export class AdminModule {}
