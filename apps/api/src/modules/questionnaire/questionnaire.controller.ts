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
import { authorizeSelfUserAccess } from "../../common/auth/authorize-self-user-access";
import { RbacService } from "../../common/rbac/rbac.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("questionnaire")
export class QuestionnaireController {
  constructor(
    private readonly questionnaireService: QuestionnaireService,
    private readonly rbacService: RbacService,
  ) {}

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
  @UseGuards(JwtAuthGuard)
  async getProfile(
    @Param("userId") userId: string,
    @Req() req: JwtReq,
  ): Promise<QuestionnaireProfileView> {
    await authorizeSelfUserAccess(this.rbacService, {
      tokenUserId: req.user?.userId,
      requestedUserId: userId,
    });
    return this.questionnaireService.getProfileForUser(userId);
  }
}
