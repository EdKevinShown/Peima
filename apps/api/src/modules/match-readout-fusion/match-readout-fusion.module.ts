import { Module } from "@nestjs/common";
import { QuestionnaireModule } from "../questionnaire/questionnaire.module";
import { MatchReadoutFusionController } from "./match-readout-fusion.controller";
import { MatchReadoutFusionService } from "./match-readout-fusion.service";

@Module({
  imports: [QuestionnaireModule],
  controllers: [MatchReadoutFusionController],
  providers: [MatchReadoutFusionService],
})
export class MatchReadoutFusionModule {}
