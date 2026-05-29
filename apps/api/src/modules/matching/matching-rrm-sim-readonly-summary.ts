/**
 * M5.2-M2A — viewer-safe `matchInsights.rrmSimReadonlySummary` payload builders (pure functions).
 * No DB, no env, no GET wiring. Controlled persistence: `matching-rrm-sim-readonly-summary-writer` (M5.2-M2B).
 *
 * Deferred (not built from raw transcripts / comparison blobs here):
 * - Direct `MatchingDecisionComparisonService` output → summary (use RrmSimResult or M4.0 proposal when available).
 */

import type { RrmRankingProposal } from "../ai-simulation-v1/ai-simulation-v1-rrm-ranking-proposal";
import { RRM_RANKING_PROPOSAL_SOURCE_VERSION } from "../ai-simulation-v1/ai-simulation-v1-rrm-ranking-proposal";
import { RRM_SIM_SOURCE_VERSION } from "../ai-simulation-v1/rrm-sim.constants";
import type { RrmSimResult } from "../ai-simulation-v1/rrm-sim.types";

/** Key on `MatchResult.matchInsights` for viewer-safe RRM-Sim summary JSON (M5.1-M2). */
export const RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY = "rrmSimReadonlySummary" as const;

const ALLOWED_RRM_SIM_READONLY_SOURCE_VERSIONS_STRICT = new Set<string>([
  "rrm-sim-v1",
  "m4.0-readonly-rrm-ranking-proposal-v1",
]);

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

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

/**
 * Strict parse of `matchInsights.rrmSimReadonlySummary` into `RrmSimReadonlySummaryPayloadV1` (M5.3-C2 resolver).
 * No DB / evaluator. Rejects partial or unknown `sourceVersion`.
 */
export function tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights(
  matchInsights: unknown,
): RrmSimReadonlySummaryPayloadV1 | null {
  if (!isRecord(matchInsights)) return null;
  const raw = matchInsights[RRM_SIM_READONLY_SUMMARY_INSIGHTS_KEY];
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== RRM_SIM_READONLY_SUMMARY_PAYLOAD_SCHEMA_VERSION) return null;
  if (raw.sourceType !== RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE) return null;
  const sourceVersion = typeof raw.sourceVersion === "string" ? raw.sourceVersion.trim() : "";
  if (!sourceVersion || !ALLOWED_RRM_SIM_READONLY_SOURCE_VERSIONS_STRICT.has(sourceVersion)) {
    return null;
  }

  const pickStr = (v: unknown, max: number): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t) return null;
    return t.slice(0, max);
  };

  const candidateUserId = pickStr(raw.candidateUserId, 64);
  const winnerUserId = pickStr(raw.winnerUserId, 64);
  const proposalCandidateUserId = pickStr(raw.proposalCandidateUserId, 64);
  if (!candidateUserId || !winnerUserId || !proposalCandidateUserId) return null;

  let confidenceBucket: RrmSimReadonlySummaryConfidenceBucket = "unknown";
  if (raw.confidenceBucket === "low" || raw.confidenceBucket === "medium" || raw.confidenceBucket === "high") {
    confidenceBucket = raw.confidenceBucket;
  }

  if (typeof raw.fallbackUsed !== "boolean") return null;

  const cautionFlags: string[] = [];
  if (Array.isArray(raw.cautionFlags)) {
    for (const x of raw.cautionFlags) {
      if (typeof x === "string" && x.trim()) cautionFlags.push(x.trim().slice(0, 120));
      if (cautionFlags.length >= 16) break;
    }
  }

  const generatedAt = pickStr(raw.generatedAt, 40);
  if (!generatedAt) return null;

  const scenarioKey = raw.scenarioKey == null ? null : pickStr(raw.scenarioKey, 80);
  const suggestedAction = raw.suggestedAction == null ? null : pickStr(raw.suggestedAction, 80);
  const progressionWindow = raw.progressionWindow == null ? null : pickStr(raw.progressionWindow, 80);
  const simulatedRhythmScore =
    typeof raw.simulatedRhythmScore === "number" && Number.isFinite(raw.simulatedRhythmScore)
      ? raw.simulatedRhythmScore
      : null;
  const recommendation = raw.recommendation == null ? null : pickStr(raw.recommendation, 400);
  const unavailableReason = raw.unavailableReason == null ? null : pickStr(raw.unavailableReason, 200);
  const frozenAt = raw.frozenAt == null ? null : pickStr(raw.frozenAt, 40);

  return {
    schemaVersion: RRM_SIM_READONLY_SUMMARY_PAYLOAD_SCHEMA_VERSION,
    sourceType: RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE,
    sourceVersion: sourceVersion as RrmSimReadonlySummaryPayloadV1["sourceVersion"],
    candidateUserId,
    winnerUserId,
    proposalCandidateUserId,
    scenarioKey,
    suggestedAction,
    progressionWindow,
    simulatedRhythmScore,
    recommendation,
    confidenceBucket,
    fallbackUsed: raw.fallbackUsed,
    unavailableReason,
    cautionFlags,
    generatedAt,
    frozenAt,
  };
}
