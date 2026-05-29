import type {
  AiSimulationLlmPayloadV2,
  RrmScenarioResultV2,
  ShortlistContractBindingV0,
  ShortlistFourDimCandidateV0,
  ShortlistFourDimV0,
} from "./ai-simulation-v1.types";
import {
  ITEM_STATUS,
  SHORTLIST_FOUR_DIM_RANKING_FORMULA_V0,
  SHORTLIST_FOUR_DIM_V0_SCHEMA,
} from "./ai-simulation-v1.constants";
import {
  RRM_LEGACY_V2_SCENARIO_KEYS_ORDERED,
  RRM_SCENARIO_KEYS_ORDERED,
} from "./ai-simulation-v1-rrm.constants";
import { computeShortlistFingerprint } from "./shortlist-contract-binding";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Math.round(n * 10_000) / 10_000;
}

function isBindingV0(x: unknown): x is ShortlistContractBindingV0 {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.previewPoolId === "string" &&
    typeof o.shortlistSchemaVersion === "string" &&
    Array.isArray(o.shortlistCandidateUserIds) &&
    o.shortlistCandidateUserIds.every((id) => typeof id === "string") &&
    typeof o.shortlistFingerprint === "string"
  );
}

function readScenarioRow(raw: unknown, expectedKey: string): RrmScenarioResultV2 | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.scenario !== expectedKey) return null;
  const ev = r.evaluator;
  if (typeof ev !== "object" || ev === null) return null;
  const evo = ev as Record<string, unknown>;
  const scenarioScore = typeof evo.scenarioScore === "number" && Number.isFinite(evo.scenarioScore) ? evo.scenarioScore : null;
  const conf = typeof evo.confidence === "number" && Number.isFinite(evo.confidence) ? evo.confidence : null;
  if (scenarioScore == null || scenarioScore < 0 || scenarioScore > 1 || conf == null || conf < 0 || conf > 1) {
    return null;
  }
  const sig = r.signals;
  if (typeof sig !== "object" || sig === null) return null;
  const s = sig as Record<string, unknown>;
  const next = typeof s.nextStepSuitability === "string" ? s.nextStepSuitability : "";
  const em = typeof s.emotionalSafety === "string" ? s.emotionalSafety : "";
  if (!next.trim() || !em.trim()) return null;
  return r as unknown as RrmScenarioResultV2;
}

function scenarioBlockShapeOk(results: unknown[], keys: readonly string[]): boolean {
  if (!Array.isArray(results) || results.length !== keys.length) return false;
  for (let i = 0; i < keys.length; i += 1) {
    if (readScenarioRow(results[i], keys[i]) == null) return false;
  }
  return true;
}

/** Exported for tests / audit parity checks. */
export function isAiSimulationTranscriptLiteV2(x: unknown): x is AiSimulationLlmPayloadV2 {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o.schemaVersion !== 2) return false;
  const sr = o.scenarioResults;
  const keys7 = RRM_SCENARIO_KEYS_ORDERED as unknown as string[];
  const keys3 = RRM_LEGACY_V2_SCENARIO_KEYS_ORDERED as unknown as string[];
  if (!scenarioBlockShapeOk(sr as unknown[], keys7) && !scenarioBlockShapeOk(sr as unknown[], keys3)) {
    return false;
  }
  const overall = o.overallSimulationAssessment;
  if (typeof overall !== "object" || overall === null) return false;
  const ov = overall as Record<string, unknown>;
  const oc = ov.confidence;
  const cc = ov.crossScenarioConsistency;
  if (typeof oc !== "number" || !Number.isFinite(oc) || oc < 0 || oc > 1) return false;
  if (typeof cc !== "string" || cc.trim().length === 0) return false;
  return true;
}

function nextStepToSafe(raw: string): number {
  const t = raw.trim();
  if (t === "continue_lightly") return 1;
  if (t === "maintain") return 0.9;
  if (t === "soft_progress") return 0.72;
  if (t === "slow_down") return 0.45;
  if (t === "stop_or_step_back") return 0.12;
  if (t.includes("stop_or_step_back")) return 0.12;
  if (t.includes("slow_down")) return 0.45;
  if (t.includes("soft_progress")) return 0.72;
  if (t.includes("maintain")) return 0.9;
  if (t.includes("continue_lightly")) return 1;
  return 0.65;
}

function emotionalSafetyScore(text: string): number {
  const t = text;
  if (/压迫|逼问|绑架|威胁|羞辱|控制|骚扰/i.test(t)) return 0.32;
  if (/拒绝空间|安全|低压力|尊重|温和|留白/i.test(t)) return 0.92;
  return 0.78;
}

function consistencyBoost(cross: string): number {
  if (/一致|稳定|相近|协调|同向/i.test(cross)) return 0.025;
  return 0;
}

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function fourDimsFromV2Payload(v2: AiSimulationLlmPayloadV2): Omit<ShortlistFourDimCandidateV0, "candidateUserId"> | null {
  const rows = v2.scenarioResults;
  const overallC = v2.overallSimulationAssessment.confidence;
  const scores = rows.map((r) => r.evaluator.scenarioScore);
  const meanS = mean(scores);
  const meanNext = mean(rows.map((r) => nextStepToSafe(r.signals.nextStepSuitability)));
  const meanEm = mean(rows.map((r) => emotionalSafetyScore(r.signals.emotionalSafety)));

  if (rows.length === RRM_LEGACY_V2_SCENARIO_KEYS_ORDERED.length) {
    const s0 = rows[0].evaluator.scenarioScore;
    const s1 = rows[1].evaluator.scenarioScore;
    const s2 = rows[2].evaluator.scenarioScore;
    const c0 = rows[0].evaluator.confidence;
    const meanS3 = (s0 + s1 + s2) / 3;
    const meanNext3 =
      (nextStepToSafe(rows[0].signals.nextStepSuitability) +
        nextStepToSafe(rows[1].signals.nextStepSuitability) +
        nextStepToSafe(rows[2].signals.nextStepSuitability)) /
      3;
    const meanEm3 =
      (emotionalSafetyScore(rows[0].signals.emotionalSafety) +
        emotionalSafetyScore(rows[1].signals.emotionalSafety) +
        emotionalSafetyScore(rows[2].signals.emotionalSafety)) /
      3;
    const openingSmoothness = clamp01(0.42 * s0 + 0.22 * s1 + 0.18 * overallC + 0.18 * c0);
    const continuation = clamp01(0.18 * s0 + 0.48 * s1 + 0.34 * s2);
    let longTermStability = clamp01(0.12 * s0 + 0.26 * s1 + 0.42 * s2 + 0.2 * overallC);
    longTermStability = clamp01(longTermStability + consistencyBoost(v2.overallSimulationAssessment.crossScenarioConsistency));
    const conflictRisk = clamp01(1 - (0.46 * meanNext3 + 0.28 * meanEm3 + 0.26 * meanS3));
    return { openingSmoothness, continuation, conflictRisk, longTermStability };
  }

  if (rows.length === RRM_SCENARIO_KEYS_ORDERED.length) {
    const [s0, s1, s2, s3, s4, s5, s6] = scores;
    const c0 = rows[0].evaluator.confidence;
    const openingSmoothness = clamp01(0.34 * s0 + 0.18 * s1 + 0.16 * s2 + 0.18 * overallC + 0.14 * c0);
    const continuation = clamp01(0.1 * s0 + 0.22 * s1 + 0.22 * s2 + 0.12 * s3 + 0.18 * s4 + 0.16 * s5);
    let longTermStability = clamp01(0.08 * s0 + 0.14 * s2 + 0.14 * s3 + 0.18 * s4 + 0.16 * s5 + 0.22 * s6 + 0.08 * overallC);
    longTermStability = clamp01(longTermStability + consistencyBoost(v2.overallSimulationAssessment.crossScenarioConsistency));
    const conflictRisk = clamp01(1 - (0.42 * meanNext + 0.3 * meanEm + 0.28 * meanS));
    return { openingSmoothness, continuation, conflictRisk, longTermStability };
  }

  return null;
}

type SidecarItemInput = {
  candidateUserId: string;
  status: string;
  transcriptLite?: unknown;
  evaluator: unknown;
};

/**
 * M0.7.1 — `shortlistFourDimV0` from RRM-ready v2 `transcriptLite` only (no `tryBuildShortlistScenariosV0`).
 */
export function tryBuildShortlistFourDimV0FromSimulationV2(
  shortlistBinding: unknown,
  items: SidecarItemInput[],
): ShortlistFourDimV0 | null {
  if (!isBindingV0(shortlistBinding)) return null;
  const binding = shortlistBinding;
  const expectedIds = binding.shortlistCandidateUserIds;
  if (expectedIds.length < 2 || expectedIds.length > 3) return null;
  if (computeShortlistFingerprint(expectedIds) !== binding.shortlistFingerprint) return null;

  const byId = new Map(items.map((it) => [it.candidateUserId, it]));
  const candidateDimensions: ShortlistFourDimCandidateV0[] = [];
  const rankedSource: { candidateUserId: string; aggregate: number }[] = [];

  for (const candidateUserId of expectedIds) {
    const it = byId.get(candidateUserId);
    if (!it || it.status !== ITEM_STATUS.SUCCEEDED) return null;
    if (!isAiSimulationTranscriptLiteV2(it.transcriptLite)) return null;
    const dims = fourDimsFromV2Payload(it.transcriptLite);
    if (!dims) return null;
    candidateDimensions.push({ candidateUserId, ...dims });
    const aggregate = clamp01(
      (dims.openingSmoothness + dims.continuation + (1 - dims.conflictRisk) + dims.longTermStability) / 4,
    );
    rankedSource.push({ candidateUserId, aggregate });
  }

  if (candidateDimensions.length !== expectedIds.length) return null;

  rankedSource.sort((a, b) =>
    b.aggregate !== a.aggregate ? b.aggregate - a.aggregate : a.candidateUserId.localeCompare(b.candidateUserId),
  );
  const rankedCandidateUserIds = rankedSource.map((r) => r.candidateUserId);
  if (new Set(rankedCandidateUserIds).size !== candidateDimensions.length) return null;
  if (computeShortlistFingerprint(rankedCandidateUserIds) !== binding.shortlistFingerprint) return null;

  return {
    schemaVersion: SHORTLIST_FOUR_DIM_V0_SCHEMA,
    shortlistFingerprint: binding.shortlistFingerprint,
    rankingFormulaVersion: SHORTLIST_FOUR_DIM_RANKING_FORMULA_V0,
    candidateDimensions,
    comparison: { rankedCandidateUserIds },
  };
}
