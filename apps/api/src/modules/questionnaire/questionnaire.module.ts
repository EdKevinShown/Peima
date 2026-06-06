import { Module } from "@nestjs/common";
import { RbacModule } from "../../common/rbac/rbac.module";
import { QuestionnaireController } from "./questionnaire.controller";
import { QuestionnaireService } from "./questionnaire.service";

@Module({
  imports: [RbacModule],
  controllers: [QuestionnaireController],
  providers: [QuestionnaireService],
  exports: [QuestionnaireService],
})
export class QuestionnaireModule {}
