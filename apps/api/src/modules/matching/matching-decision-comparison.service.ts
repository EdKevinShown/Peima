import { HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PreviewPoolService } from "../preview-pool/preview-pool.service";
import { parseFinalizeMetaV1Loose } from "./matching-result-display";
import { MatchingRrmRankingProposalService } from "./matching-rrm-ranking-proposal.service";
import {
  M4_1_DECISION_COMPARISON_NOTE,
  M4_1_DECISION_COMPARISON_SOURCE_VERSION,
  type DecisionComparisonSummaryDto,
  type MatchingDecisionComparisonHttpDto,
  type MatchResultOriginalComparisonDto,
  type PairwiseFrozenComparisonDto,
  type RrmReadonlyComparisonDto,
  type StaticShortlistComparisonDto,
} from "./matching-decision-comparison.types";

function cmpEq(a: string | null | undefined, b: string | null | undefined): boolean | null {
  if (a == null || b == null || a === "" || b === "") {
    return null;
  }
  return a === b;
}

function collectAllSelectedIds(params: {
  staticShortlist: StaticShortlistComparisonDto | null;
  matchResult: MatchResultOriginalComparisonDto | null;
  pairwise: PairwiseFrozenComparisonDto;
  rrmTop1: string | null;
}): string[] {
  const s = new Set<string>();
  const { staticShortlist, matchResult, pairwise, rrmTop1 } = params;
  if (staticShortlist?.top1CandidateUserId) {
    s.add(staticShortlist.top1CandidateUserId);
  }
  if (staticShortlist?.top2CandidateUserId) {
    s.add(staticShortlist.top2CandidateUserId);
  }
  if (matchResult?.candidateUserId) {
    s.add(matchResult.candidateUserId);
  }
  if (pairwise.present) {
    if (pairwise.selectedCandidateUserId) s.add(pairwise.selectedCandidateUserId);
    if (pairwise.staticTop1CandidateUserId) s.add(pairwise.staticTop1CandidateUserId);
    if (pairwise.pairwiseWinnerCandidateUserId) s.add(pairwise.pairwiseWinnerCandidateUserId);
  }
  if (rrmTop1) {
    s.add(rrmTop1);
  }
  return [...s].sort((x, y) => x.localeCompare(y));
}

function buildSummary(params: {
  staticShortlist: StaticShortlistComparisonDto | null;
  matchResult: MatchResultOriginalComparisonDto | null;
  pairwise: PairwiseFrozenComparisonDto;
  rrm: RrmReadonlyComparisonDto;
  notes: string[];
}): DecisionComparisonSummaryDto {
  const { staticShortlist, matchResult, pairwise, rrm, notes } = params;
  const staticTop1 = staticShortlist?.top1CandidateUserId ?? null;
  const matchId = matchResult?.candidateUserId ?? null;
  const pairwiseSelected = pairwise.present ? pairwise.selectedCandidateUserId : null;
  const rrmTop1 = rrm.present ? rrm.rrmTop1CandidateUserId : null;

  const allSelectedIds = collectAllSelectedIds({
    staticShortlist,
    matchResult,
    pairwise,
    rrmTop1: rrmTop1 ?? null,
  });

  return {
    allSelectedIds,
    uniqueCandidateCount: allSelectedIds.length,
    staticTop1EqualsMatchResultOriginal: cmpEq(staticTop1, matchId),
    staticTop1EqualsPairwiseSelected: cmpEq(staticTop1, pairwiseSelected),
    staticTop1EqualsRrmTop1: cmpEq(staticTop1, rrmTop1),
    matchResultOriginalEqualsPairwiseSelected: cmpEq(matchId, pairwiseSelected),
    matchResultOriginalEqualsRrmTop1: cmpEq(matchId, rrmTop1),
    pairwiseSelectedEqualsRrmTop1: cmpEq(pairwiseSelected, rrmTop1),
    notes: [...notes],
  };
}

@Injectable()
export class MatchingDecisionComparisonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly previewPoolService: PreviewPoolService,
    private readonly rrmRankingProposal: MatchingRrmRankingProposalService,
  ) {}

  async getComparison(viewerUserId: string, poolId: string): Promise<MatchingDecisionComparisonHttpDto> {
    const pool = await this.prisma.previewPool.findFirst({
      where: { id: poolId, userId: viewerUserId },
    });
    if (!pool) {
      throw new NotFoundException(`Preview pool ${poolId} not found`);
    }

    const notes: string[] = [];

    const contract = await this.previewPoolService.buildShortlistContractV0ForPool(viewerUserId, poolId);
    let staticShortlist: StaticShortlistComparisonDto | null = null;
    if (contract?.shortlist?.candidateUserIds?.length) {
      const ids = contract.shortlist.candidateUserIds;
      staticShortlist = {
        source: "preview_pool_shortlist_contract_v0",
        top1CandidateUserId: ids[0] ?? null,
        top2CandidateUserId: ids[1] ?? null,
        shortlistSize: ids.length,
      };
    } else {
      notes.push(M4_1_DECISION_COMPARISON_NOTE.STATIC_SHORTLIST_MISSING);
    }

    const matchRow = await this.prisma.matchResult.findFirst({
      where: { userId: viewerUserId },
      orderBy: { createdAt: "desc" },
    });
    let matchResultOriginal: MatchResultOriginalComparisonDto | null = null;
    if (matchRow) {
      matchResultOriginal = {
        matchResultId: matchRow.id,
        candidateUserId: matchRow.candidateUserId,
        finalScore: matchRow.finalScore ?? null,
        createdAt: matchRow.createdAt.toISOString(),
      };
    } else {
      notes.push(M4_1_DECISION_COMPARISON_NOTE.MATCH_RESULT_MISSING);
    }

    const finalizeRow = await this.prisma.pairwisePoolFinalizeMeta.findUnique({
      where: {
        viewerUserId_poolId: {
          viewerUserId,
          poolId,
        },
      },
    });

    let pairwiseFrozen: PairwiseFrozenComparisonDto = { present: false };
    if (finalizeRow?.frozen === true) {
      const meta = parseFinalizeMetaV1Loose(finalizeRow.meta);
      if (meta) {
        pairwiseFrozen = {
          present: true,
          selectedCandidateUserId: meta.selectedCandidateUserId,
          staticTop1CandidateUserId: meta.staticTop1CandidateUserId,
          pairwiseWinnerCandidateUserId: meta.pairwiseWinnerCandidateUserId,
          sourceType: meta.sourceType,
          mode: meta.mode,
          frozen: true,
          wouldChangeStaticResult: meta.wouldChangeStaticResult,
          fallbackReason: meta.fallbackReason,
          appliedToFinalScore: meta.appliedToFinalScore,
          appliedToWorkerRanking: meta.appliedToWorkerRanking,
        };
      } else {
        notes.push(M4_1_DECISION_COMPARISON_NOTE.PAIRWISE_META_MISSING);
      }
    } else {
      notes.push(M4_1_DECISION_COMPARISON_NOTE.PAIRWISE_META_MISSING);
    }

    let rrmReadonly: RrmReadonlyComparisonDto;
    try {
      const rrmDto = await this.rrmRankingProposal.getReadonlyProposal(viewerUserId, poolId);
      rrmReadonly = {
        present: true,
        simulationJobId: rrmDto.simulationJobId,
        rrmTop1CandidateUserId: rrmDto.rrmTop1CandidateUserId,
        wouldChangeStaticResult: rrmDto.wouldChangeStaticResult,
        appliedToMatchResult: false,
        appliedToFinalScore: false,
        appliedToDisplayCandidate: false,
      };
    } catch (e) {
      if (e instanceof HttpException) {
        const body = e.getResponse();
        if (
          body &&
          typeof body === "object" &&
          !Array.isArray(body) &&
          (body as Record<string, unknown>).code === "NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL"
        ) {
          rrmReadonly = { present: false, code: "NO_SUCCEEDED_SIMULATION_JOB_FOR_POOL" };
          notes.push(M4_1_DECISION_COMPARISON_NOTE.RRM_PROPOSAL_MISSING);
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    const comparisonSummary = buildSummary({
      staticShortlist,
      matchResult: matchResultOriginal,
      pairwise: pairwiseFrozen,
      rrm: rrmReadonly,
      notes,
    });

    return {
      schemaVersion: 1,
      sourceVersion: M4_1_DECISION_COMPARISON_SOURCE_VERSION,
      mode: "readonly",
      viewerUserId,
      poolId,
      staticShortlist,
      matchResultOriginal,
      pairwiseFrozen,
      rrmReadonly,
      comparisonSummary,
    };
  }
}
