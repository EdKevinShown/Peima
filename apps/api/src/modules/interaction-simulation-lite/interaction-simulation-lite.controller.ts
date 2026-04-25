import {
  Controller,
  Get,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { InteractionSimulationLiteResponseDto } from "./interaction-simulation-lite.types";
import { InteractionSimulationLiteService } from "./interaction-simulation-lite.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("interaction-simulation-lite")
@UseGuards(JwtAuthGuard)
export class InteractionSimulationLiteController {
  constructor(
    private readonly interactionSimulationLiteService: InteractionSimulationLiteService,
  ) {}

  @Get("match-results/:matchResultId")
  getSimulation(
    @Param("matchResultId") matchResultId: string,
    @Req() req: JwtReq,
  ): Promise<InteractionSimulationLiteResponseDto> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.interactionSimulationLiteService.getSimulation(
      matchResultId,
      tokenUserId,
    );
  }
}
