import { Module } from "@nestjs/common";
import { QuestionnaireModule } from "../questionnaire/questionnaire.module";
import { PrescreenV0Service } from "./prescreen-v0.service";

@Module({
  imports: [QuestionnaireModule],
  providers: [PrescreenV0Service],
  exports: [PrescreenV0Service],
})
export class PrescreenV0Module {}
