import type { PairwiseFinalSourceShadowRecord } from "../ai-pairwise-decision/ai-pairwise-final-source-shadow";
import type { PairwiseFinalizeMode } from "./pairwise-finalize-env";

export const FINAL_MATCH_DECISION_META_SCHEMA_VERSION = 1 as const;

export type FinalMatchDecisionSourceType = "static_final" | "pairwise_final" | "static_fallback";

/** M3.8-M11: persisted JSON for `pairwise_pool_finalize_meta.meta` — no raw scores / dimensions / strongRisk. */
export type FinalMatchDecisionMetaV1 = {
  schemaVersion: typeof FINAL_MATCH_DECISION_META_SCHEMA_VERSION;
  sourceVersion: string;
  sourceType: FinalMatchDecisionSourceType;
  mode: PairwiseFinalizeMode;
  pairwiseJobId: string;
  pairwiseProposalRecommendation: string;
  staticTop1CandidateUserId: string;
  pairwiseWinnerCandidateUserId: string | null;
  /** M3.8-M11/M13: static Top1 或（`mode=enabled` 且 gate 通过时）pairwise winner。 */
  selectedCandidateUserId: string;
  fallbackReason: string | null;
  wouldChangeStaticResult: boolean;
  frozen: boolean;
  frozenAt: string | null;
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  generatedAt: string;
};

/**
 * Build finalize meta. **Does not** write DB.
 * M3.8-M11: `proposal_only` / `shadow` → `selectedCandidateUserId` 恒为 static Top1。
 * M3.8-M13: `enabled` 且 M7 gate 为 `pairwise_winner_eligible` 时 → `selectedCandidateUserId` 为 pairwise winner（仍仅 Top2 内）。
 */
export function buildFinalMatchDecisionMetaV1(input: {
  sourceVersion: string;
  mode: PairwiseFinalizeMode;
  pairwiseJobId: string;
  shadow: PairwiseFinalSourceShadowRecord;
}): FinalMatchDecisionMetaV1 {
  const { shadow, mode, pairwiseJobId, sourceVersion } = input;
  const staticTop1 = shadow.staticTop1CandidateUserId;
  const now = new Date().toISOString();
  const eligible = shadow.proposalRecommendation === "pairwise_winner_eligible";
  const useWinner =
    mode === "enabled" &&
    eligible &&
    Boolean(shadow.pairwiseWinnerCandidateUserId) &&
    shadow.shadowSelectedCandidateUserId === shadow.pairwiseWinnerCandidateUserId;

  const selectedCandidateUserId = useWinner ? shadow.pairwiseWinnerCandidateUserId! : staticTop1;

  let sourceType: FinalMatchDecisionSourceType;
  if (useWinner) {
    sourceType = "pairwise_final";
  } else if (eligible) {
    sourceType = "static_final";
  } else {
    sourceType = "static_fallback";
  }

  return {
    schemaVersion: FINAL_MATCH_DECISION_META_SCHEMA_VERSION,
    sourceVersion,
    sourceType,
    mode,
    pairwiseJobId,
    pairwiseProposalRecommendation: shadow.proposalRecommendation,
    staticTop1CandidateUserId: staticTop1,
    pairwiseWinnerCandidateUserId: shadow.pairwiseWinnerCandidateUserId,
    selectedCandidateUserId,
    fallbackReason: shadow.fallbackReason,
    wouldChangeStaticResult: shadow.wouldChangeStaticResult,
    frozen: true,
    frozenAt: now,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    generatedAt: now,
  };
}
