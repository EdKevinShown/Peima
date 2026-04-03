import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { BehaviorSignal } from "@peima/database";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateBehaviorSignalDto } from "./dto/create-behavior-signal.dto";
import { BehaviorSignalService } from "./behavior-signal.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("behavior-signals")
@UseGuards(JwtAuthGuard)
export class BehaviorSignalController {
  constructor(private readonly behaviorSignalService: BehaviorSignalService) {}

  @Post()
  create(
    @Body() dto: CreateBehaviorSignalDto,
    @Req() req: JwtReq,
  ): Promise<BehaviorSignal> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.behaviorSignalService.create(dto, tokenUserId);
  }

  @Get("mine")
  listMine(@Req() req: JwtReq): Promise<BehaviorSignal[]> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.behaviorSignalService.listMine(tokenUserId);
  }
}
