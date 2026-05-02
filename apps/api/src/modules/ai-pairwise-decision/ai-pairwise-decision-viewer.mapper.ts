import type { AiPairwiseDecision } from "./ai-pairwise-decision.types";
import type { PairwiseDecisionJobPublicDto } from "./ai-pairwise-decision-job.service";
import type { GenerateAiPairwiseDecisionFailureDetail } from "./ai-pairwise-decision-generate.contracts";

const FAILURE_MESSAGE_MAX = 500;

function clipMessage(s: string): string {
  if (s.length <= FAILURE_MESSAGE_MAX) return s;
  return `${s.slice(0, FAILURE_MESSAGE_MAX)}…`;
}

export type ViewerPairwiseShortlistCandidateDto = {
  candidateUserId: string;
  staticRank: 1 | 2;
  staticCompatibilityScore: number;
  reasonSummary: string;
};

export type ViewerPairwiseDecisionCandidateSliceDto = {
  candidateUserId: string;
  suggestedAction: AiPairwiseDecision["candidateA"]["suggestedAction"];
  progressionWindow: AiPairwiseDecision["candidateA"]["progressionWindow"];
  reasonSummary: string;
};

export type ViewerPairwiseDecisionSliceDto = {
  winnerCandidateId: string;
  loserCandidateId: string;
  decisionConfidence: number;
  decisionReason: string;
  candidateA: ViewerPairwiseDecisionCandidateSliceDto;
  candidateB: ViewerPairwiseDecisionCandidateSliceDto;
  fallbackUsed: boolean;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
};

export type ViewerPairwiseFailureDto = {
  code: GenerateAiPairwiseDecisionFailureDetail["code"];
  message: string;
};

/** M3.8-M5: safe subset for MatchingWaitingPage polling (no raw LLM / no axis / no majorRisks). */
export type ViewerPairwiseJobResponseDto = {
  id: string;
  viewerUserId: string;
  poolId: string;
  status: string;
  sourceVersion: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  shortlist: { candidates: ViewerPairwiseShortlistCandidateDto[] };
  decision: ViewerPairwiseDecisionSliceDto | null;
  failure: ViewerPairwiseFailureDto | null;
};

function mapShortlistCandidates(job: PairwiseDecisionJobPublicDto): ViewerPairwiseShortlistCandidateDto[] {
  return job.shortlistSnapshot.candidates.map((c) => ({
    candidateUserId: c.candidateUserId,
    staticRank: c.staticRank,
    staticCompatibilityScore: c.staticCompatibilityScore,
    reasonSummary: c.reasonSummary,
  }));
}

function mapDecisionSlice(d: AiPairwiseDecision): ViewerPairwiseDecisionSliceDto {
  return {
    winnerCandidateId: d.winnerCandidateId,
    loserCandidateId: d.loserCandidateId,
    decisionConfidence: d.decisionConfidence,
    decisionReason: d.decisionReason,
    candidateA: {
      candidateUserId: d.candidateAUserId,
      suggestedAction: d.candidateA.suggestedAction,
      progressionWindow: d.candidateA.progressionWindow,
      reasonSummary: d.candidateA.reasonSummary,
    },
    candidateB: {
      candidateUserId: d.candidateBUserId,
      suggestedAction: d.candidateB.suggestedAction,
      progressionWindow: d.candidateB.progressionWindow,
      reasonSummary: d.candidateB.reasonSummary,
    },
    fallbackUsed: d.fallbackUsed,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
  };
}

function mapFailure(f: GenerateAiPairwiseDecisionFailureDetail): ViewerPairwiseFailureDto {
  return {
    code: f.code,
    message: clipMessage(f.message ?? ""),
  };
}

export function mapPairwiseJobPublicToViewerDto(job: PairwiseDecisionJobPublicDto): ViewerPairwiseJobResponseDto {
  return {
    id: job.id,
    viewerUserId: job.viewerUserId,
    poolId: job.poolId,
    status: job.status,
    sourceVersion: job.sourceVersion,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    shortlist: { candidates: mapShortlistCandidates(job) },
    decision: job.decisionResult ? mapDecisionSlice(job.decisionResult) : null,
    failure: job.failureDetail ? mapFailure(job.failureDetail) : null,
  };
}
