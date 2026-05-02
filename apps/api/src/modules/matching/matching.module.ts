import { Module } from "@nestjs/common";
import { AiSimulationV1Module } from "../ai-simulation-v1/ai-simulation-v1.module";
import { PreviewPoolModule } from "../preview-pool/preview-pool.module";
import { MatchingController } from "./matching.controller";
import { MatchingDecisionComparisonService } from "./matching-decision-comparison.service";
import { MatchingFinalizePairwiseService } from "./matching-finalize-pairwise.service";
import { MatchingRrmRankingProposalService } from "./matching-rrm-ranking-proposal.service";
import { MatchingService } from "./matching.service";

@Module({
  imports: [AiSimulationV1Module, PreviewPoolModule],
  controllers: [MatchingController],
  providers: [
    MatchingService,
    MatchingFinalizePairwiseService,
    MatchingRrmRankingProposalService,
    MatchingDecisionComparisonService,
  ],
  exports: [MatchingService, MatchingFinalizePairwiseService],
})
export class MatchingModule {}
