/**
 * M5.2-M2A — viewer-safe `matchInsights.rrmSimReadonlySummary` payload builders (pure functions).
 * No DB, no env, no GET wiring. Persistence / safe-write hook: M5.2-M2B+.
 *
 * Deferred (not built from raw transcripts / comparison blobs here):
 * - Direct `MatchingDecisionComparisonService` output → summary (use RrmSimResult or M4.0 proposal when available).
 */

import type { RrmRankingProposal } from "../ai-simulation-v1/ai-simulation-v1-rrm-ranking-proposal";
import { RRM_RANKING_PROPOSAL_SOURCE_VERSION } from "../ai-simulation-v1/ai-simulation-v1-rrm-ranking-proposal";
import { RRM_SIM_SOURCE_VERSION } from "../ai-simulation-v1/rrm-sim.constants";
import type { RrmSimResult } from "../ai-simulation-v1/rrm-sim.types";
import { RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY } from "./matching-multi-source-final-decision-m51m0";

/** Payload `schemaVersion` under `matchInsights.rrmSimReadonlySummary` (M5.1-M2 parser). */
export const RRM_SIM_READONLY_SUMMARY_PAYLOAD_SCHEMA_VERSION = 1 as const;

/**
 * Default `sourceVersion` for summaries built from `RrmSimResult` (must stay in parser allow-list).
 * M4.0 proposal-derived summaries use `RRM_RANKING_PROPOSAL_SOURCE_VERSION` instead.
 */
export const RRM_SIM_READONLY_SUMMARY_SOURCE_VERSION = RRM_SIM_SOURCE_VERSION;

export const RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE = "rrm_sim_readonly_summary" as const;

export type RrmSimReadonlySummaryConfidenceBucket = "low" | "medium" | "high" | "unknown";

export type RrmSimReadonlySummaryPayloadV1 = {
  schemaVersion: typeof RRM_SIM_READONLY_SUMMARY_PAYLOAD_SCHEMA_VERSION;
  sourceType: typeof RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE;
  sourceVersion: typeof RRM_SIM_SOURCE_VERSION | typeof RRM_RANKING_PROPOSAL_SOURCE_VERSION;
  candidateUserId: string;
  winnerUserId: string;
  proposalCandidateUserId: string;
  scenarioKey: string | null;
  suggestedAction: string | null;
  progressionWindow: string | null;
  simulatedRhythmScore: number | null;
  recommendation: string | null;
  confidenceBucket: RrmSimReadonlySummaryConfidenceBucket;
  fallbackUsed: boolean;
  unavailableReason: string | null;
  cautionFlags: string[];
  generatedAt: string;
  frozenAt: string | null;
};

export type BuildRrmSimReadonlySummaryContext = {
  candidateUserId: string;
  /** ISO-8601; required for deterministic tests (no `Date.now()` in builders). */
  generatedAt: string;
  /** Optional; default derives from first `scenarioScores[].scenario` or `"aggregate"`. */
  scenarioKey?: string | null;
  frozenAt?: string | null;
};

function trimGeneratedAt(iso: string): string {
  return iso.trim().slice(0, 40);
}

function trimFrozenAt(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim().slice(0, 40);
  return t || null;
}

function confidenceFromRrmSimLevels(rrm: RrmSimResult): RrmSimReadonlySummaryConfidenceBucket {
  if (rrm.fallbackUsed) return "low";
  const rl = rrm.levels.riskLevel;
  if (rl === "high") return "low";
  if (rl === "low") return "high";
  return "medium";
}

function cautionFlagsFromRrmSim(rrm: RrmSimResult): string[] {
  const f: string[] = [];
  if (rrm.fallbackUsed) f.push("rrm_fallback");
  if (rrm.levels.riskLevel === "high") f.push("risk_band_high");
  if (typeof rrm.rrmUnavailableReason === "string" && rrm.rrmUnavailableReason.trim()) {
    f.push("rrm_partial");
  }
  return f;
}

function pickScenarioKey(rrm: RrmSimResult, override: string | null | undefined): string | null {
  if (override !== undefined && override != null) {
    const t = String(override).trim();
    return t ? t.slice(0, 80) : null;
  }
  const first = rrm.scenarioScores[0]?.scenario;
  if (typeof first === "string" && first.trim()) return first.trim().slice(0, 80);
  return "aggregate";
}

export function buildRrmSimReadonlySummaryFromRrmSimResult(
  rrm: RrmSimResult,
  ctx: BuildRrmSimReadonlySummaryContext,
): RrmSimReadonlySummaryPayloadV1 {
  const cid = ctx.candidateUserId.trim();
  const scenarioKey = pickScenarioKey(rrm, ctx.scenarioKey);

  return {
    schemaVersion: RRM_SIM_READONLY_SUMMARY_PAYLOAD_SCHEMA_VERSION,
    sourceType: RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE,
    sourceVersion: RRM_SIM_SOURCE_VERSION,
    candidateUserId: cid,
    winnerUserId: cid,
    proposalCandidateUserId: cid,
    scenarioKey,
    suggestedAction: rrm.suggestedAction,
    progressionWindow: rrm.progressionWindow,
    simulatedRhythmScore: rrm.scores.simulatedRhythmScore,
    recommendation: null,
    confidenceBucket: confidenceFromRrmSimLevels(rrm),
    fallbackUsed: rrm.fallbackUsed === true,
    unavailableReason: rrm.rrmUnavailableReason,
    cautionFlags: cautionFlagsFromRrmSim(rrm),
    generatedAt: trimGeneratedAt(ctx.generatedAt),
    frozenAt: trimFrozenAt(ctx.frozenAt),
  };
}

const M40_PROPOSAL_SCENARIO_KEY = "m4_readonly_proposal_row";

function buildProposalRowPayload(
  ctx: BuildRrmSimReadonlySummaryContext,
  proposal: RrmRankingProposal,
  item: RrmRankingProposal["items"][number],
  fields: {
    suggestedAction: string | null;
    progressionWindow: string | null;
    simulatedRhythmScore: number | null;
  },
): RrmSimReadonlySummaryPayloadV1 {
  const cid = ctx.candidateUserId.trim();
  return {
    schemaVersion: RRM_SIM_READONLY_SUMMARY_PAYLOAD_SCHEMA_VERSION,
    sourceType: RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE,
    sourceVersion: RRM_RANKING_PROPOSAL_SOURCE_VERSION,
    candidateUserId: cid,
    winnerUserId: cid,
    proposalCandidateUserId: cid,
    scenarioKey: M40_PROPOSAL_SCENARIO_KEY,
    suggestedAction: fields.suggestedAction,
    progressionWindow: fields.progressionWindow,
    simulatedRhythmScore: fields.simulatedRhythmScore,
    recommendation: proposal.recommendation,
    confidenceBucket: proposal.confidenceLevel,
    fallbackUsed: item.fallbackUsed === true,
    unavailableReason: null,
    cautionFlags: proposal.warnings.length > 0 ? ["m4_proposal_readonly"] : [],
    generatedAt: trimGeneratedAt(ctx.generatedAt),
    frozenAt: trimFrozenAt(ctx.frozenAt),
  };
}

export function buildRrmSimReadonlySummaryFromRrmProposal(
  proposal: RrmRankingProposal,
  ctx: BuildRrmSimReadonlySummaryContext,
): RrmSimReadonlySummaryPayloadV1 | null {
  const cid = ctx.candidateUserId.trim();
  const item = proposal.items.find((i) => i.candidateUserId === cid);
  if (!item) return null;

  const suggestedAction =
    typeof item.suggestedAction === "string" && item.suggestedAction.trim()
      ? item.suggestedAction.trim()
      : null;
  const progressionWindow =
    typeof item.progressionWindow === "string" && item.progressionWindow.trim()
      ? item.progressionWindow.trim()
      : null;
  const simulatedRhythmScore =
    typeof item.simulatedRhythmScore === "number" && Number.isFinite(item.simulatedRhythmScore)
      ? item.simulatedRhythmScore
      : null;

  if (!suggestedAction && !progressionWindow && simulatedRhythmScore == null) {
    return buildProposalRowPayload(ctx, proposal, item, {
      suggestedAction: "maintain",
      progressionWindow: null,
      simulatedRhythmScore: null,
    });
  }

  return buildProposalRowPayload(ctx, proposal, item, {
    suggestedAction,
    progressionWindow,
    simulatedRhythmScore,
  });
}

export function mergeRrmSimReadonlySummaryIntoMatchInsights(
  matchInsights: unknown,
  summary: RrmSimReadonlySummaryPayloadV1,
): Record<string, unknown> {
  const base =
    typeof matchInsights === "object" && matchInsights !== null && !Array.isArray(matchInsights)
      ? { ...(matchInsights as Record<string, unknown>) }
      : {};
  base[RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY] = { ...summary };
  return base;
}
