import {
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminService } from "../admin/admin.service";
import {
  assertCanTriggerTestMatch,
  canUserTriggerTestMatch,
} from "./test-match.policy";

type JwtReq = {
  user?: { userId: string };
};

/**
 * Dev/QA only: same subprocess as admin batch-match, separate env allowlist.
 */
@Controller("test")
@UseGuards(JwtAuthGuard)
export class TestController {
  constructor(private readonly adminService: AdminService) {}

  @Get("matching/capabilities")
  matchingCapabilities(
    @Req() req: JwtReq,
  ): { testBatchMatchTrigger: boolean } {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    return {
      testBatchMatchTrigger: canUserTriggerTestMatch(userId),
    };
  }

  @Post("matching/run-batch-once")
  async runBatchOnce(@Req() req: JwtReq): Promise<{ ok: true }> {
    const userId = req.user?.userId;
    assertCanTriggerTestMatch(userId);
    await this.adminService.runBatchMatchSubprocess();
    return { ok: true };
  }
}
