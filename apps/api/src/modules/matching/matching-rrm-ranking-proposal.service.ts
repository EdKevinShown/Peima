import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AiSimulationV1Service } from "../ai-simulation-v1/ai-simulation-v1.service";
import type { RrmSimMultiCandidateDiagnostic } from "../ai-simulation-v1/ai-simulation-v1-rrm-multi-candidate-diagnostic";
import type {
  RrmRankingProposal,
  RrmRankingProposalConfidence,
} from "../ai-simulation-v1/ai-simulation-v1-rrm-ranking-proposal";
import { RRM_RANKING_PROPOSAL_SOURCE_VERSION } from "../ai-simulation-v1/ai-simulation-v1-rrm-ranking-proposal";

export type MatchingRrmRankingProposalRowDto = {
  candidateUserId: string;
  rank: number;
  rrmScore: number | null;
  confidence: RrmRankingProposalConfidence;
  riskLevel: "low" | "medium" | "high";
  reasonCodes: string[];
};

/** M4.0 — JWT matching 只读响应；与 admin `rrmRankingProposal` 字段名对齐处见文档。 */
export type MatchingRrmRankingProposalHttpDto = {
  schemaVersion: 1;
  sourceVersion: typeof RRM_RANKING_PROPOSAL_SOURCE_VERSION;
  mode: "readonly";
  viewerUserId: string;
  poolId: string;
  simulationJobId: string;
  staticTop1CandidateUserId: string | null;
  rrmTop1CandidateUserId: string | null;
  wouldChangeStaticResult: boolean;
  appliedToMatchResult: false;
  appliedToFinalScore: false;
  appliedToDisplayCandidate: false;
  ranking: MatchingRrmRankingProposalRowDto[];
};

function readStaticTop1FromShortlistBinding(binding: unknown): string | null {
  if (binding == null || typeof binding !== "object" || Array.isArray(binding)) {
    return null;
  }
  const ids = (binding as Record<string, unknown>).shortlistCandidateUserIds;
  if (!Array.isArray(ids) || ids.length === 0 || typeof ids[0] !== "string") {
    return null;
  }
  return ids[0];
}

function buildRankingRows(
  diagnostic: RrmSimMultiCandidateDiagnostic,
  confidenceLevel: RrmRankingProposalConfidence,
): MatchingRrmRankingProposalRowDto[] {
  const byId = new Map(diagnostic.items.map((i) => [i.candidateUserId, i]));
  return diagnostic.rankings.rrmRhythmRank.map((candidateUserId, idx) => {
    const row = byId.get(candidateUserId);
    const rrmScore = row?.simulatedRhythmScore ?? null;
    const fallbackUsed = row?.fallbackUsed === true;
    const unavail = row?.rrmUnavailableReason;
    let riskLevel: "low" | "medium" | "high" = "low";
    if (fallbackUsed) {
      riskLevel = "high";
    } else if (unavail != null && String(unavail).length > 0) {
      riskLevel = "medium";
    }
    const reasonCodes: string[] = [];
    if (fallbackUsed) {
      reasonCodes.push("RRM_FALLBACK");
    }
    if (unavail != null && String(unavail).length > 0) {
      reasonCodes.push("RRM_UNAVAILABLE");
    }
    if (rrmScore == null && !fallbackUsed) {
      reasonCodes.push("RRM_SCORE_MISSING");
    }
    return {
      candidateUserId,
      rank: idx + 1,
      rrmScore,
      confidence: confidenceLevel,
      riskLevel,
      reasonCodes,
    };
  });
}

@Injectable()
export class MatchingRrmRankingProposalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiSimulationV1: AiSimulationV1Service,
  ) {}

  async getReadonlyProposal(viewerUserId: string, poolId: string): Promise<MatchingRrmRankingProposalHttpDto> {
    const pool = await this.prisma.previewPool.findFirst({
      where: { id: poolId, userId: viewerUserId },
    });
    if (!pool) {
      throw new NotFoundException(`Preview pool ${poolId} not found`);
    }

    const payload = await this.aiSimulationV1.getRrmRankingProposalReadonlyForPool(viewerUserId, poolId);
    const proposal: RrmRankingProposal = payload.rrmRankingProposal;
    const staticTop1CandidateUserId = readStaticTop1FromShortlistBinding(payload.shortlistBinding);
    const rrmTop1CandidateUserId = proposal.rrmTopCandidateUserId;
    const wouldChangeStaticResult = Boolean(
      staticTop1CandidateUserId &&
        rrmTop1CandidateUserId &&
        staticTop1CandidateUserId !== rrmTop1CandidateUserId,
    );

    return {
      schemaVersion: 1,
      sourceVersion: RRM_RANKING_PROPOSAL_SOURCE_VERSION,
      mode: "readonly",
      viewerUserId,
      poolId,
      simulationJobId: payload.simulationJobId,
      staticTop1CandidateUserId,
      rrmTop1CandidateUserId,
      wouldChangeStaticResult,
      appliedToMatchResult: false,
      appliedToFinalScore: false,
      appliedToDisplayCandidate: false,
      ranking: buildRankingRows(payload.rrmSimMultiCandidateDiagnostic, proposal.confidenceLevel),
    };
  }
}
