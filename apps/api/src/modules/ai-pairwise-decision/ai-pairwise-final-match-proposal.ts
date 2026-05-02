import type { AiPairwiseDecision, RelationshipShortlistTop2 } from "./ai-pairwise-decision.types";

export const PAIRWISE_FINAL_MATCH_PROPOSAL_SCHEMA_VERSION = 1 as const;
export const PAIRWISE_FINAL_MATCH_PROPOSAL_SOURCE_VERSION = "pairwise-final-match-proposal-v1" as const;

export type PairwiseFinalMatchJobStatusGate = "queued" | "running" | "succeeded" | "failed";

export type PairwiseFinalMatchStrongRiskPolicy = "fallback_static_top1" | "no_confident_match";

export type BuildPairwiseFinalMatchProposalInput = {
  shortlist: RelationshipShortlistTop2;
  decision: AiPairwiseDecision | null;
  jobStatus: PairwiseFinalMatchJobStatusGate;
  now?: Date;
  options?: {
    minConfidence?: number;
    minScoreGap?: number;
    strongRiskPolicy?: PairwiseFinalMatchStrongRiskPolicy;
  };
};

export type PairwiseFinalMatchRecommendation =
  | "pairwise_winner_eligible"
  | "static_top1_fallback"
  | "no_confident_match"
  | "pairwise_unavailable";

export type PairwiseFinalMatchProposal = {
  schemaVersion: typeof PAIRWISE_FINAL_MATCH_PROPOSAL_SCHEMA_VERSION;
  sourceVersion: typeof PAIRWISE_FINAL_MATCH_PROPOSAL_SOURCE_VERSION;
  mode: "proposal_only";
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  recommendation: PairwiseFinalMatchRecommendation;
  /** Proposed primary candidate user id for Final Match UX (null when `no_confident_match`). */
  candidateUserId: string | null;
  /** Static rank-1 id from shortlist (always populated for reference / fallback UX). */
  fallbackCandidateUserId: string;
  reasonCode: string;
  reasonSummary: string;
  pairwiseJobStatus: PairwiseFinalMatchJobStatusGate;
  decisionConfidence: number | null;
  decisionScoreGap: number | null;
  winnerCandidateId: string | null;
  staticTop1CandidateUserId: string;
};

const DEFAULT_MIN_CONFIDENCE = 0.6;
const DEFAULT_MIN_SCORE_GAP = 5;
const DEFAULT_STRONG_RISK_POLICY: PairwiseFinalMatchStrongRiskPolicy = "fallback_static_top1";

function staticTop1Id(shortlist: RelationshipShortlistTop2): string {
  return shortlist.candidates[0].candidateUserId;
}

function decisionBindingMatchesShortlist(d: AiPairwiseDecision, shortlist: RelationshipShortlistTop2): boolean {
  const a = shortlist.candidates[0].candidateUserId;
  const b = shortlist.candidates[1].candidateUserId;
  return d.candidateAUserId === a && d.candidateBUserId === b;
}

function winnerInTop2(d: AiPairwiseDecision, shortlist: RelationshipShortlistTop2): boolean {
  const ids = new Set([shortlist.candidates[0].candidateUserId, shortlist.candidates[1].candidateUserId]);
  return ids.has(d.winnerCandidateId);
}

function winnerBlock(d: AiPairwiseDecision): AiPairwiseDecision["candidateA"] {
  return d.winnerCandidateId === d.candidateAUserId ? d.candidateA : d.candidateB;
}

function loserBlock(d: AiPairwiseDecision): AiPairwiseDecision["candidateA"] {
  return d.winnerCandidateId === d.candidateAUserId ? d.candidateB : d.candidateA;
}

/**
 * M3.8-M7: pure proposal gate — **no** `MatchResult` / DB writes; does not replace any displayed object.
 */
export function buildPairwiseFinalMatchProposal(input: BuildPairwiseFinalMatchProposalInput): PairwiseFinalMatchProposal {
  void input.now;
  const shortlist = input.shortlist;
  const top1 = staticTop1Id(shortlist);
  const jobStatus = input.jobStatus;
  const minConfidence = input.options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const minScoreGap = input.options?.minScoreGap ?? DEFAULT_MIN_SCORE_GAP;
  const strongRiskPolicy = input.options?.strongRiskPolicy ?? DEFAULT_STRONG_RISK_POLICY;

  const base = (
    partial: Omit<
      PairwiseFinalMatchProposal,
      | "schemaVersion"
      | "sourceVersion"
      | "mode"
      | "appliedToFinalScore"
      | "appliedToWorkerRanking"
      | "staticTop1CandidateUserId"
      | "fallbackCandidateUserId"
    > & { fallbackCandidateUserId?: string },
  ): PairwiseFinalMatchProposal => ({
    schemaVersion: PAIRWISE_FINAL_MATCH_PROPOSAL_SCHEMA_VERSION,
    sourceVersion: PAIRWISE_FINAL_MATCH_PROPOSAL_SOURCE_VERSION,
    mode: "proposal_only",
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    staticTop1CandidateUserId: top1,
    fallbackCandidateUserId: partial.fallbackCandidateUserId ?? top1,
    recommendation: partial.recommendation,
    candidateUserId: partial.candidateUserId,
    reasonCode: partial.reasonCode,
    reasonSummary: partial.reasonSummary,
    pairwiseJobStatus: partial.pairwiseJobStatus,
    decisionConfidence: partial.decisionConfidence,
    decisionScoreGap: partial.decisionScoreGap,
    winnerCandidateId: partial.winnerCandidateId,
  });

  if (jobStatus !== "succeeded" || input.decision == null) {
    return base({
      recommendation: "pairwise_unavailable",
      candidateUserId: top1,
      reasonCode: "pairwise_job_not_succeeded_or_missing_decision",
      reasonSummary: "Pairwise job is not succeeded or decision is missing; use static top-1.",
      pairwiseJobStatus: jobStatus,
      decisionConfidence: input.decision?.decisionConfidence ?? null,
      decisionScoreGap:
        input.decision != null
          ? Math.abs(input.decision.decisionScoreA - input.decision.decisionScoreB)
          : null,
      winnerCandidateId: input.decision?.winnerCandidateId ?? null,
    });
  }

  const d = input.decision;

  if (!decisionBindingMatchesShortlist(d, shortlist) || !winnerInTop2(d, shortlist)) {
    return base({
      recommendation: "pairwise_unavailable",
      candidateUserId: top1,
      reasonCode: "invalid_decision_binding",
      reasonSummary: "Decision ids do not match shortlist Top2 or winner is not in the pool.",
      pairwiseJobStatus: jobStatus,
      decisionConfidence: d.decisionConfidence,
      decisionScoreGap: Math.abs(d.decisionScoreA - d.decisionScoreB),
      winnerCandidateId: d.winnerCandidateId,
    });
  }

  const winBlock = winnerBlock(d);
  const loseBlock = loserBlock(d);
  const bothStrong = winBlock.strongRisk && loseBlock.strongRisk;
  if (bothStrong) {
    if (strongRiskPolicy === "no_confident_match") {
      return base({
        recommendation: "no_confident_match",
        candidateUserId: null,
        reasonCode: "both_candidates_strong_risk",
        reasonSummary: "Both Top2 candidates flagged strongRisk; policy rejects a confident winner.",
        pairwiseJobStatus: jobStatus,
        decisionConfidence: d.decisionConfidence,
        decisionScoreGap: Math.abs(d.decisionScoreA - d.decisionScoreB),
        winnerCandidateId: d.winnerCandidateId,
      });
    }
    return base({
      recommendation: "static_top1_fallback",
      candidateUserId: top1,
      reasonCode: "both_candidates_strong_risk_fallback_static",
      reasonSummary: "Both Top2 candidates flagged strongRisk; fallback to static rank-1.",
      pairwiseJobStatus: jobStatus,
      decisionConfidence: d.decisionConfidence,
      decisionScoreGap: Math.abs(d.decisionScoreA - d.decisionScoreB),
      winnerCandidateId: d.winnerCandidateId,
    });
  }

  if (winBlock.strongRisk) {
    if (strongRiskPolicy === "no_confident_match") {
      return base({
        recommendation: "no_confident_match",
        candidateUserId: null,
        reasonCode: "winner_strong_risk_policy_no_match",
        reasonSummary: "Winner has strongRisk and policy rejects using this winner.",
        pairwiseJobStatus: jobStatus,
        decisionConfidence: d.decisionConfidence,
        decisionScoreGap: Math.abs(d.decisionScoreA - d.decisionScoreB),
        winnerCandidateId: d.winnerCandidateId,
      });
    }
    return base({
      recommendation: "static_top1_fallback",
      candidateUserId: top1,
      reasonCode: "winner_strong_risk_fallback_static",
      reasonSummary: "Winner has strongRisk; fallback to static rank-1.",
      pairwiseJobStatus: jobStatus,
      decisionConfidence: d.decisionConfidence,
      decisionScoreGap: Math.abs(d.decisionScoreA - d.decisionScoreB),
      winnerCandidateId: d.winnerCandidateId,
    });
  }

  if (d.decisionConfidence < minConfidence) {
    return base({
      recommendation: "static_top1_fallback",
      candidateUserId: top1,
      reasonCode: "low_decision_confidence",
      reasonSummary: `Decision confidence below threshold (${minConfidence}).`,
      pairwiseJobStatus: jobStatus,
      decisionConfidence: d.decisionConfidence,
      decisionScoreGap: Math.abs(d.decisionScoreA - d.decisionScoreB),
      winnerCandidateId: d.winnerCandidateId,
    });
  }

  const gap = Math.abs(d.decisionScoreA - d.decisionScoreB);
  if (gap < minScoreGap) {
    return base({
      recommendation: "static_top1_fallback",
      candidateUserId: top1,
      reasonCode: "narrow_decision_score_gap",
      reasonSummary: `Score gap below threshold (${minScoreGap}).`,
      pairwiseJobStatus: jobStatus,
      decisionConfidence: d.decisionConfidence,
      decisionScoreGap: gap,
      winnerCandidateId: d.winnerCandidateId,
    });
  }

  return base({
    recommendation: "pairwise_winner_eligible",
    candidateUserId: d.winnerCandidateId,
    reasonCode: "pairwise_gates_passed",
    reasonSummary: "Pairwise decision passes proposal gates; winner may be used as proposal source.",
    pairwiseJobStatus: jobStatus,
    decisionConfidence: d.decisionConfidence,
    decisionScoreGap: gap,
    winnerCandidateId: d.winnerCandidateId,
  });
}

export type ViewerPairwiseFinalMatchProposalDto = {
  recommendation: PairwiseFinalMatchRecommendation;
  candidateUserId: string | null;
  reasonSummary: string;
  mode: "proposal_only";
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
};

/** M3.8-M7: strips scores / gaps / strongRisk / dimensions from proposal for viewer surfaces. */
export function mapPairwiseFinalMatchProposalToViewerDto(p: PairwiseFinalMatchProposal): ViewerPairwiseFinalMatchProposalDto {
  return {
    recommendation: p.recommendation,
    candidateUserId: p.candidateUserId,
    reasonSummary: p.reasonSummary,
    mode: p.mode,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
  };
}
