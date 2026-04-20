import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { SubmitQuestionnaireDto } from "./dto/submit-questionnaire.dto";
import type {
  QuestionnaireProfileView,
  QuestionsPayload,
  SubmitQuestionnaireResult,
} from "./questionnaire.service";
import { QuestionnaireService } from "./questionnaire.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

type JwtReq = {
  user?: { userId: string };
};

@Controller("questionnaire")
export class QuestionnaireController {
  constructor(private readonly questionnaireService: QuestionnaireService) {}

  @Get("questions")
  getQuestions(): QuestionsPayload {
    return this.questionnaireService.getQuestionBank();
  }

  @Post("submit")
  @UseGuards(JwtAuthGuard)
  submit(
    @Body() dto: SubmitQuestionnaireDto,
    @Req() req: JwtReq,
  ): Promise<SubmitQuestionnaireResult> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || dto.userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.questionnaireService.submit(dto);
  }

  @Get("profile/:userId")
  getProfile(
    @Param("userId") userId: string,
  ): Promise<QuestionnaireProfileView> {
    return this.questionnaireService.getProfileForUser(userId);
  }
}
