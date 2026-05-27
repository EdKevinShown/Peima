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
import type { PreviewPoolBundle } from "../preview-pool/preview-pool.service";
import {
  assertCanSeedTestPreviewPool,
  assertCanTriggerTestMatch,
  canUserSeedTestPreviewPool,
  canUserTriggerTestMatch,
} from "./test-match.policy";
import { TestPreviewPoolSeedService } from "./test-preview-pool-seed.service";

type JwtReq = {
  user?: { userId: string };
};

/**
 * Dev/QA only: same subprocess as admin batch-match, separate env allowlist.
 */
@Controller("test")
@UseGuards(JwtAuthGuard)
export class TestController {
  constructor(
    private readonly adminService: AdminService,
    private readonly testPreviewPoolSeedService: TestPreviewPoolSeedService,
  ) {}

  @Get("matching/capabilities")
  matchingCapabilities(
    @Req() req: JwtReq,
  ): { testBatchMatchTrigger: boolean; testPreviewPoolSeed: boolean } {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    return {
      testBatchMatchTrigger: canUserTriggerTestMatch(userId),
      testPreviewPoolSeed: canUserSeedTestPreviewPool(userId),
    };
  }

  @Post("matching/run-batch-once")
  async runBatchOnce(@Req() req: JwtReq): Promise<{ ok: true }> {
    const userId = req.user?.userId;
    assertCanTriggerTestMatch(userId);
    await this.adminService.runBatchMatchSubprocess();
    return { ok: true };
  }

  /**
   * Dev/QA only: seed a readonly latest PreviewPool for local smoke tests.
   * Does not write MatchResult / finalScore and does not restore legacy generate.
   */
  @Post("preview-pool/seed-latest")
  async seedLatestPreviewPool(@Req() req: JwtReq): Promise<PreviewPoolBundle> {
    const userId = req.user?.userId;
    assertCanSeedTestPreviewPool(userId);
    return this.testPreviewPoolSeedService.seedLatestForUser(userId);
  }
}
