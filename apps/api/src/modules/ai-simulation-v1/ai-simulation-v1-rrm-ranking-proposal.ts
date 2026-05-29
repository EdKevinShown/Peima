import type { RrmSimMultiCandidateDiagnostic } from "./ai-simulation-v1-rrm-multi-candidate-diagnostic";

/** M4.0 read-only: hypothetical RRM-only ordering for admin/diagnostic review only. */
export const RRM_RANKING_PROPOSAL_SOURCE_VERSION = "m4.0-readonly-rrm-ranking-proposal-v1" as const;

export type RrmRankingProposalRecommendation =
  | "do_not_use_for_ranking"
  | "insufficient_separation"
  | "review_manually"
  | "supports_existing_rank"
  | "diagnostic_only";

export type RrmRankingProposalConfidence = "low" | "medium" | "high";

export type RrmRankingProposalItem = {
  candidateUserId: string;
  existingRank: number | null;
  rrmRank: number | null;
  simulatedRhythmScore: number | null;
  suggestedAction: string | null;
  progressionWindow: string | null;
  fallbackUsed: boolean | null;
  reasonSummary: string;
};

export type RrmRankingProposal = {
  schemaVersion: 1;
  sourceVersion: typeof RRM_RANKING_PROPOSAL_SOURCE_VERSION;
  mode: "readonly";
  appliedToFinalScore: false;
  appliedToWorkerRanking: false;
  existingTopCandidateUserId: string | null;
  rrmTopCandidateUserId: string | null;
  topCandidateChanged: boolean;
  scoreDistributionFlag: RrmSimMultiCandidateDiagnostic["diagnostics"]["scoreDistributionFlag"];
  confidenceLevel: RrmRankingProposalConfidence;
  recommendation: RrmRankingProposalRecommendation;
  items: RrmRankingProposalItem[];
  warnings: string[];
};

function rrmRankIndex(rankOrder: string[], candidateUserId: string): number | null {
  const i = rankOrder.indexOf(candidateUserId);
  return i === -1 ? null : i + 1;
}

function deriveRecommendation(d: RrmSimMultiCandidateDiagnostic): {
  recommendation: RrmRankingProposalRecommendation;
  confidenceLevel: RrmRankingProposalConfidence;
} {
  const { diagnostics: diag, rankings } = d;
  const spread = diag.scoreRange.spread;
  const topChanged = diag.topCandidateChangedIfRrmOnly;

  if (diag.scoreDistributionFlag === "too_many_fallbacks") {
    return { recommendation: "do_not_use_for_ranking", confidenceLevel: "low" };
  }
  if (diag.scoreDistributionFlag === "too_narrow") {
    return { recommendation: "insufficient_separation", confidenceLevel: "low" };
  }

  if (topChanged && spread >= 8) {
    return { recommendation: "review_manually", confidenceLevel: "medium" };
  }

  const existingTop = rankings.existingSimulationRank[0] ?? null;
  const rrmTop = rankings.rrmRhythmRank[0] ?? null;
  if (!topChanged && existingTop != null && rrmTop != null && existingTop === rrmTop) {
    return { recommendation: "supports_existing_rank", confidenceLevel: "high" };
  }

  return { recommendation: "diagnostic_only", confidenceLevel: "medium" };
}

function buildReasonSummary(params: {
  existingRank: number | null;
  rrmRank: number | null;
  fallbackUsed: boolean | null;
  topChanged: boolean;
}): string {
  const parts: string[] = [];
  if (params.fallbackUsed === true) {
    parts.push("RRM used fallback path");
  } else if (params.fallbackUsed === false) {
    parts.push("RRM non-fallback");
  }
  if (params.existingRank != null) parts.push(`existing rank ${params.existingRank}`);
  if (params.rrmRank != null) parts.push(`RRM-only rank ${params.rrmRank}`);
  if (params.topChanged && params.existingRank === 1 && params.rrmRank != null && params.rrmRank > 1) {
    parts.push("would drop from #1 under RRM-only sort");
  }
  return parts.length > 0 ? parts.join("; ") : "diagnostic row";
}

function buildWarnings(
  d: RrmSimMultiCandidateDiagnostic,
  recommendation: RrmRankingProposalRecommendation,
): string[] {
  const w: string[] = [];
  const diag = d.diagnostics;
  if (diag.scoreDistributionFlag === "too_many_fallbacks") {
    w.push("High fraction of RRM fallback rows; RRM-only ordering is unreliable.");
  }
  if (diag.scoreDistributionFlag === "too_narrow") {
    w.push("Non-fallback simulatedRhythmScore spread is below the diagnostic threshold (8) with 3+ RRM rows.");
  }
  if (recommendation === "review_manually") {
    w.push("RRM-only top candidate differs from existing simulation top with sufficient score spread; manual review suggested.");
  }
  if (diag.topCandidateChangedIfRrmOnly && diag.scoreRange.spread < 8 && diag.scoreDistributionFlag === "ok") {
    w.push("Top would change under RRM-only sort but rhythm score spread is small; treat as weak signal.");
  }
  return w;
}

/** Read-only M4.0 proposal derived from existing multi-candidate diagnostic (no LLM, no DB writes). */
export function buildRrmRankingProposal(diagnostic: RrmSimMultiCandidateDiagnostic): RrmRankingProposal {
  const { recommendation, confidenceLevel } = deriveRecommendation(diagnostic);
  const rankOrder = diagnostic.rankings.rrmRhythmRank;
  const topChanged = diagnostic.diagnostics.topCandidateChangedIfRrmOnly;

  const items: RrmRankingProposalItem[] = diagnostic.items.map((row) => {
    const rrmRank = rrmRankIndex(rankOrder, row.candidateUserId);
    return {
      candidateUserId: row.candidateUserId,
      existingRank: row.existingRank,
      rrmRank,
      simulatedRhythmScore: row.simulatedRhythmScore,
      suggestedAction: row.suggestedAction,
      progressionWindow: row.progressionWindow,
      fallbackUsed: row.fallbackUsed,
      reasonSummary: buildReasonSummary({
        existingRank: row.existingRank,
        rrmRank,
        fallbackUsed: row.fallbackUsed,
        topChanged,
      }),
    };
  });

  const existingTop = diagnostic.rankings.existingSimulationRank[0] ?? null;
  const rrmTop = diagnostic.rankings.rrmRhythmRank[0] ?? null;

  return {
    schemaVersion: 1,
    sourceVersion: RRM_RANKING_PROPOSAL_SOURCE_VERSION,
    mode: "readonly",
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    existingTopCandidateUserId: existingTop,
    rrmTopCandidateUserId: rrmTop,
    topCandidateChanged: topChanged,
    scoreDistributionFlag: diagnostic.diagnostics.scoreDistributionFlag,
    confidenceLevel,
    recommendation,
    items,
    warnings: buildWarnings(diagnostic, recommendation),
  };
}
