import {
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminService } from "./admin.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("admin")
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("capabilities")
  capabilities(@Req() req: JwtReq): { batchMatchTrigger: boolean } {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    return {
      batchMatchTrigger: this.adminService.canSeeBatchMatchTrigger(userId),
    };
  }

  @Post("batch-match/run-once")
  async runBatchMatchOnce(@Req() req: JwtReq): Promise<{ ok: true }> {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    this.adminService.assertCanTriggerBatchMatch(userId);
    await this.adminService.runBatchMatchSubprocess();
    return { ok: true };
  }
}
