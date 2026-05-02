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
import type { BatchMatchQueue } from "@peima/database";
import { EnqueueMatchDto } from "./dto/enqueue-match.dto";
import { FinalizeWithPairwiseDto } from "./dto/finalize-with-pairwise.dto";
import { MatchingDecisionComparisonService } from "./matching-decision-comparison.service";
import { MatchingFinalizePairwiseService } from "./matching-finalize-pairwise.service";
import { MatchingRrmRankingProposalService } from "./matching-rrm-ranking-proposal.service";
import type { MatchResultViewerPayload, MatchStatusPayload } from "./matching.service";
import { MatchingService } from "./matching.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

type JwtReq = {
  user?: { userId: string };
};

@UseGuards(JwtAuthGuard)
@Controller("matching")
export class MatchingController {
  constructor(
    private readonly matchingService: MatchingService,
    private readonly finalizePairwise: MatchingFinalizePairwiseService,
    private readonly rrmRankingProposal: MatchingRrmRankingProposalService,
    private readonly decisionComparison: MatchingDecisionComparisonService,
  ) {}

  @Post("enqueue")
  enqueue(
    @Body() dto: EnqueueMatchDto,
    @Req() req: JwtReq,
  ): Promise<BatchMatchQueue> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || dto.userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.matchingService.enqueue(dto);
  }

  @Get("status/:userId")
  getStatus(
    @Param("userId") userId: string,
    @Req() req: JwtReq,
  ): Promise<MatchStatusPayload> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.matchingService.getStatusForUser(userId);
  }

  @Get("result/:userId")
  getResult(
    @Param("userId") userId: string,
    @Req() req: JwtReq,
  ): Promise<MatchResultViewerPayload> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.matchingService.getLatestResultForUser(userId);
  }

  /** M4.0 — 只读 RRM 排序提案；不写 MatchResult、不改 display、不重跑 LLM。 */
  @Get("rrm-ranking-proposal/:poolId")
  getRrmRankingProposal(@Param("poolId") poolId: string, @Req() req: JwtReq) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.rrmRankingProposal.getReadonlyProposal(tokenUserId, poolId.trim());
  }

  /** M4.1 — 只读四源决策对照；不写库、不改 GET /matching/result。 */
  @Get("decision-comparison/:poolId")
  getDecisionComparison(@Param("poolId") poolId: string, @Req() req: JwtReq) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.decisionComparison.getComparison(tokenUserId, poolId.trim());
  }

  /** M3.8-M11: finalize sidecar — JWT `viewerUserId` only; never mutates `MatchResult.candidateUserId`. */
  @Post("finalize-with-pairwise")
  finalizeWithPairwise(@Body() body: FinalizeWithPairwiseDto, @Req() req: JwtReq) {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.finalizePairwise.finalizeWithPairwise({
      viewerUserId: tokenUserId,
      poolId: body.poolId.trim(),
      pairwiseJobId: body.pairwiseJobId.trim(),
    });
  }
}
