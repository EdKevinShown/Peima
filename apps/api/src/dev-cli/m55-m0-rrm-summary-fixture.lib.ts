/**
 * M5.5-M0.1 — pure helpers for local RRM `rrmSimReadonlySummary` fixture (dev CLI + tests).
 * Not a production writer.
 */
import { RRM_SIM_SOURCE_VERSION } from "../modules/ai-simulation-v1/rrm-sim.constants";
import {
  mergeRrmSimReadonlySummaryIntoMatchInsights,
  RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE,
  RRM_SIM_READONLY_SUMMARY_PAYLOAD_SCHEMA_VERSION,
  type RrmSimReadonlySummaryPayloadV1,
} from "../modules/matching/matching-rrm-sim-readonly-summary";

/** Block fixture tools when `NODE_ENV` is production (CLI + tests). */
export function isM55FixtureBlockedInProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Minimal viewer-safe summary aligned with `tryParseRrmSimReadonlySummaryPayloadV1FromMatchInsights`
 * and `matching-result-display-candidate.spec.ts` (no raw RRM dimensions / prompts / transcripts).
 */
export function buildM55RrmSimReadonlySummaryFixture(
  baselineUserId: string,
  winnerUserId: string,
  generatedAtIso: string,
): RrmSimReadonlySummaryPayloadV1 {
  const baseline = baselineUserId.trim();
  const winner = winnerUserId.trim();
  return {
    schemaVersion: RRM_SIM_READONLY_SUMMARY_PAYLOAD_SCHEMA_VERSION,
    sourceType: RRM_SIM_READONLY_SUMMARY_SOURCE_TYPE,
    sourceVersion: RRM_SIM_SOURCE_VERSION,
    candidateUserId: baseline,
    winnerUserId: winner,
    proposalCandidateUserId: winner,
    scenarioKey: null,
    suggestedAction: "maintain",
    progressionWindow: null,
    simulatedRhythmScore: 1,
    recommendation: "ok",
    confidenceBucket: "high",
    fallbackUsed: false,
    unavailableReason: null,
    cautionFlags: [],
    generatedAt: generatedAtIso.trim().slice(0, 40),
    frozenAt: null,
  };
}

/** Shallow-merge `rrmSimReadonlySummary` into existing `matchInsights` (preserves other keys). */
export function mergeM55RrmSummaryFixtureIntoInsights(
  existingMatchInsights: unknown,
  baselineUserId: string,
  winnerUserId: string,
  generatedAtIso: string,
): Record<string, unknown> {
  const summary = buildM55RrmSimReadonlySummaryFixture(baselineUserId, winnerUserId, generatedAtIso);
  return mergeRrmSimReadonlySummaryIntoMatchInsights(existingMatchInsights, summary);
}
