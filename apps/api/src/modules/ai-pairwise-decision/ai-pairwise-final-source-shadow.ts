import type { AiPairwiseDecision, RelationshipShortlistTop2 } from "./ai-pairwise-decision.types";
import {
  buildPairwiseFinalMatchProposal,
  type BuildPairwiseFinalMatchProposalInput,
  type PairwiseFinalMatchRecommendation,
} from "./ai-pairwise-final-match-proposal";

export const PAIRWISE_FINAL_SOURCE_SHADOW_SCHEMA_VERSION = 1 as const;
export const PAIRWISE_FINAL_SOURCE_SHADOW_SOURCE_VERSION = "pairwise-final-source-shadow-v1" as const;

export type PairwiseFinalSourceShadowJobStatus = "succeeded" | "failed";

export type PairwiseFinalSourceShadowRecord = {
  schemaVersion: typeof PAIRWISE_FINAL_SOURCE_SHADOW_SCHEMA_VERSION;
  sourceVersion: typeof PAIRWISE_FINAL_SOURCE_SHADOW_SOURCE_VERSION;
  mode: "shadow";
  pairwiseJobId: string;
  viewerUserId: string;
  poolId: string;
  staticTop1CandidateUserId: string;
  /** Raw pairwise winner id when a decision exists; otherwise null (no raw scores / dimensions). */
  pairwiseWinnerCandidateUserId: string | null;
  proposalRecommendation: PairwiseFinalMatchRecommendation;
  shadowSelectedCandidateUserId: string;
  wouldChangeStaticResult: boolean;
  fallbackReason: string | null;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  generatedAt: string;
};

export type BuildPairwiseFinalSourceShadowRecordInput = {
  pairwiseJobId: string;
  viewerUserId: string;
  poolId: string;
  shortlist: RelationshipShortlistTop2;
  decision: AiPairwiseDecision | null;
  jobStatus: PairwiseFinalSourceShadowJobStatus;
  proposalOptions?: BuildPairwiseFinalMatchProposalInput["options"];
};

/**
 * M3.8-M9: Phase-2 shadow record — **no** `MatchResult` / `finalScore` / worker ranking; no raw scores / dimensions / strongRisk.
 */
export function buildPairwiseFinalSourceShadowRecord(
  input: BuildPairwiseFinalSourceShadowRecordInput,
): PairwiseFinalSourceShadowRecord {
  const staticTop1 = input.shortlist.candidates[0].candidateUserId;
  const gateStatus = input.jobStatus === "succeeded" ? "succeeded" : "failed";

  const proposal = buildPairwiseFinalMatchProposal({
    shortlist: input.shortlist,
    decision: input.decision,
    jobStatus: gateStatus,
    options: input.proposalOptions,
  });

  const pairwiseWinnerCandidateUserId = input.decision?.winnerCandidateId ?? null;

  let shadowSelectedCandidateUserId: string;
  let fallbackReason: string | null = null;

  if (proposal.recommendation === "pairwise_winner_eligible") {
    shadowSelectedCandidateUserId = proposal.candidateUserId!;
  } else if (proposal.recommendation === "no_confident_match") {
    shadowSelectedCandidateUserId = staticTop1;
    fallbackReason = "no_confident_match_static_fallback";
  } else {
    shadowSelectedCandidateUserId = staticTop1;
    fallbackReason = proposal.reasonCode;
  }

  const wouldChangeStaticResult = shadowSelectedCandidateUserId !== staticTop1;

  return {
    schemaVersion: PAIRWISE_FINAL_SOURCE_SHADOW_SCHEMA_VERSION,
    sourceVersion: PAIRWISE_FINAL_SOURCE_SHADOW_SOURCE_VERSION,
    mode: "shadow",
    pairwiseJobId: input.pairwiseJobId,
    viewerUserId: input.viewerUserId,
    poolId: input.poolId,
    staticTop1CandidateUserId: staticTop1,
    pairwiseWinnerCandidateUserId,
    proposalRecommendation: proposal.recommendation,
    shadowSelectedCandidateUserId,
    wouldChangeStaticResult,
    fallbackReason,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    generatedAt: new Date().toISOString(),
  };
}

/** Parse persisted `finalSourceShadow` JSON from `ai_pairwise_decision_jobs`. */
export function parseStoredFinalSourceShadowRecord(raw: unknown): PairwiseFinalSourceShadowRecord | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== 1 || o.sourceVersion !== PAIRWISE_FINAL_SOURCE_SHADOW_SOURCE_VERSION) return null;
  return raw as PairwiseFinalSourceShadowRecord;
}
