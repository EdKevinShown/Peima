import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { TestingObservabilityGuard } from "./testing-observability.guard";
import type { TestingObservabilityRequest } from "./testing-observability.guard";
import { TestingObservabilityService } from "./testing-observability.service";

type MatchFeedbackBody = {
  userId: string;
  matchResultId?: string;
  rating: string;
  reasonCodes?: string[];
  freeText?: string;
  source?: string;
};

@Controller("admin/testing-observability")
@UseGuards(TestingObservabilityGuard)
export class TestingObservabilityController {
  constructor(private readonly service: TestingObservabilityService) {}

  @Get("users")
  listUsers(@Query("limit") limit?: string) {
    return this.service.listUsers(limit);
  }

  @Get("users/:userId")
  getUser(@Param("userId") userId: string) {
    return this.service.getUserDetail(userId);
  }

  @Get("users/:userId/onboarding")
  getOnboarding(@Param("userId") userId: string) {
    return this.service.getOnboarding(userId);
  }

  @Get("users/:userId/questionnaire")
  getQuestionnaire(@Param("userId") userId: string) {
    return this.service.getQuestionnaire(userId);
  }

  @Get("users/:userId/match")
  getUserMatch(@Param("userId") userId: string) {
    return this.service.getUserMatch(userId);
  }

  @Get("matches")
  listMatches(@Query("limit") limit?: string) {
    return this.service.listMatches(limit);
  }

  @Get("matches/:matchResultId")
  getMatch(@Param("matchResultId") matchResultId: string) {
    return this.service.getMatchById(matchResultId);
  }

  @Get("events")
  listEvents(
    @Query("userId") userId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listEvents({ userId, limit });
  }

  @Post("match-feedback")
  createFeedback(
    @Req() req: TestingObservabilityRequest,
    @Body() body: MatchFeedbackBody,
  ) {
    return this.service.createMatchFeedback(body, req.testingObservabilityAuth);
  }
}
