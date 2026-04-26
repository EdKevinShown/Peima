import { ITEM_STATUS, SHORTLIST_SCENARIOS_V0_SCHEMA, SHORTLIST_SCENE_KEYS_V0 } from "./ai-simulation-v1.constants";
import type {
  EvaluatorV1,
  ShortlistContractBindingV0,
  ShortlistSceneKeyV0,
  ShortlistScenarioRowV0,
  ShortlistScenariosV0,
} from "./ai-simulation-v1.types";
import { computeShortlistFingerprint } from "./shortlist-contract-binding";

type ItemRow = {
  candidateUserId: string;
  status: string;
  evaluator: unknown;
};

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

function readEvaluator(ev: unknown): EvaluatorV1 | null {
  if (typeof ev !== "object" || ev === null) return null;
  const o = ev as Record<string, unknown>;
  if (typeof o.simulationRankScore !== "number" || !Number.isFinite(o.simulationRankScore)) return null;
  if (!Array.isArray(o.risk_tags)) return null;
  if (
    o.continue_recommendation !== "explore_more" &&
    o.continue_recommendation !== "hold" &&
    o.continue_recommendation !== "slow_down"
  ) {
    return null;
  }
  return o as unknown as EvaluatorV1;
}

function scoreForScene(sceneKey: ShortlistSceneKeyV0, ev: EvaluatorV1): number {
  const base = clamp01(ev.simulationRankScore);
  const risk = clamp01(ev.risk_tags.length / 6);
  if (sceneKey === "first_message_opening") return clamp01(base);
  if (sceneKey === "pace_negotiation") {
    const pace = ev.continue_recommendation === "explore_more" ? 1 : ev.continue_recommendation === "hold" ? 0.6 : 0.2;
    return clamp01((base + pace) / 2);
  }
  if (sceneKey === "misunderstanding_repair") {
    const recover = ev.continue_recommendation === "slow_down" ? 0.35 : 0.8;
    return clamp01((1 - risk + recover) / 2);
  }
  if (sceneKey === "long_term_lifestyle_alignment") {
    const steady = ev.continue_recommendation === "explore_more" ? 0.85 : ev.continue_recommendation === "hold" ? 0.6 : 0.35;
    return clamp01((base + steady + (1 - risk)) / 3);
  }
  if (sceneKey === "values_commitment_conflict") {
    const valueFit = ev.continue_recommendation === "explore_more" ? 0.8 : ev.continue_recommendation === "hold" ? 0.55 : 0.3;
    return clamp01((valueFit + (1 - risk)) / 2);
  }
  if (sceneKey === "re_engagement_after_lull") {
    const reEngage =
      ev.continue_recommendation === "explore_more" ? 0.9 : ev.continue_recommendation === "hold" ? 0.65 : 0.35;
    return clamp01((base + reEngage + (1 - risk)) / 3);
  }
  if (sceneKey === "emotional_support_under_stress") {
    const support =
      ev.continue_recommendation === "explore_more" ? 0.88 : ev.continue_recommendation === "hold" ? 0.62 : 0.38;
    return clamp01((base + support + (1 - risk)) / 3);
  }
  if (sceneKey === "friends_family_integration_boundary") {
    const integration =
      ev.continue_recommendation === "explore_more" ? 0.86 : ev.continue_recommendation === "hold" ? 0.6 : 0.36;
    return clamp01((base + integration + (1 - risk)) / 3);
  }
  if (sceneKey === "future_planning_tradeoff") {
    const negotiate =
      ev.continue_recommendation === "explore_more" ? 0.87 : ev.continue_recommendation === "hold" ? 0.61 : 0.37;
    return clamp01((base + negotiate + (1 - risk)) / 3);
  }
  return clamp01(1 - risk);
}

function toShortReason(sceneKey: ShortlistSceneKeyV0, status: "succeeded" | "failed", score: number): string {
  if (status === "failed") return "scene_input_unavailable";
  if (sceneKey === "first_message_opening") {
    if (score >= 0.75) return "opening_flow_good";
    if (score >= 0.45) return "opening_flow_moderate";
    return "opening_flow_weak";
  }
  if (sceneKey === "pace_negotiation") {
    if (score >= 0.75) return "pace_alignment_good";
    if (score >= 0.45) return "pace_alignment_moderate";
    return "pace_alignment_weak";
  }
  if (sceneKey === "boundary_conflict_response") {
    if (score >= 0.75) return "boundary_handling_stable";
    if (score >= 0.45) return "boundary_handling_mixed";
    return "boundary_handling_fragile";
  }
  if (sceneKey === "misunderstanding_repair") {
    if (score >= 0.75) return "repair_capacity_good";
    if (score >= 0.45) return "repair_capacity_moderate";
    return "repair_capacity_weak";
  }
  if (sceneKey === "values_commitment_conflict") {
    if (score >= 0.75) return "values_commitment_alignment_good";
    if (score >= 0.45) return "values_commitment_alignment_moderate";
    return "values_commitment_alignment_weak";
  }
  if (sceneKey === "re_engagement_after_lull") {
    if (score >= 0.75) return "re_engagement_quality_good";
    if (score >= 0.45) return "re_engagement_quality_moderate";
    return "re_engagement_quality_weak";
  }
  if (sceneKey === "emotional_support_under_stress") {
    if (score >= 0.75) return "stress_support_capacity_good";
    if (score >= 0.45) return "stress_support_capacity_moderate";
    return "stress_support_capacity_weak";
  }
  if (sceneKey === "friends_family_integration_boundary") {
    if (score >= 0.75) return "friends_family_boundary_good";
    if (score >= 0.45) return "friends_family_boundary_moderate";
    return "friends_family_boundary_weak";
  }
  if (sceneKey === "long_term_lifestyle_alignment") {
    if (score >= 0.75) return "lifestyle_alignment_good";
    if (score >= 0.45) return "lifestyle_alignment_moderate";
    return "lifestyle_alignment_weak";
  }
  if (sceneKey === "future_planning_tradeoff") {
    if (score >= 0.75) return "future_planning_tradeoff_alignment_good";
    if (score >= 0.45) return "future_planning_tradeoff_alignment_moderate";
    return "future_planning_tradeoff_alignment_weak";
  }
  if (score >= 0.75) return "lifestyle_alignment_good";
  if (score >= 0.45) return "lifestyle_alignment_moderate";
  return "lifestyle_alignment_weak";
}

function toRiskPoint(sceneKey: ShortlistSceneKeyV0, status: "succeeded" | "failed", score: number): string {
  if (status === "failed") return "insufficient_scene_evidence";
  if (sceneKey === "first_message_opening") {
    return score >= 0.45 ? "opening_risk_low" : "opening_cold_start_risk";
  }
  if (sceneKey === "pace_negotiation") {
    return score >= 0.45 ? "pace_risk_low" : "pace_mismatch_risk";
  }
  if (sceneKey === "boundary_conflict_response") {
    return score >= 0.45 ? "boundary_risk_low" : "boundary_escalation_risk";
  }
  if (sceneKey === "misunderstanding_repair") {
    return score >= 0.45 ? "repair_risk_low" : "misunderstanding_accumulation_risk";
  }
  if (sceneKey === "values_commitment_conflict") {
    return score >= 0.45 ? "values_commitment_risk_low" : "values_commitment_conflict_risk";
  }
  if (sceneKey === "re_engagement_after_lull") {
    return score >= 0.45 ? "re_engagement_risk_low" : "re_engagement_dropoff_risk";
  }
  if (sceneKey === "emotional_support_under_stress") {
    return score >= 0.45 ? "stress_support_risk_low" : "stress_support_absence_risk";
  }
  if (sceneKey === "friends_family_integration_boundary") {
    return score >= 0.45 ? "friends_family_boundary_risk_low" : "friends_family_boundary_strain_risk";
  }
  if (sceneKey === "long_term_lifestyle_alignment") {
    return score >= 0.45 ? "lifestyle_risk_low" : "long_term_lifestyle_gap_risk";
  }
  if (sceneKey === "future_planning_tradeoff") {
    return score >= 0.45 ? "future_planning_tradeoff_risk_low" : "future_planning_tradeoff_gap_risk";
  }
  return score >= 0.45 ? "lifestyle_risk_low" : "long_term_lifestyle_gap_risk";
}

/** Template string for UI/audit only; `tryBuildShortlistFourDimV0` does not read this field. */
function toEvidenceSnippet(
  sceneKey: ShortlistSceneKeyV0,
  candidateUserId: string,
  status: "succeeded" | "failed",
  score: number,
): string {
  const shortCandidate = candidateUserId.slice(0, 16);
  const raw = `scene=${sceneKey};cand=${shortCandidate};status=${status};score=${score.toFixed(4)}`;
  return raw.length <= 88 ? raw : raw.slice(0, 88);
}

function toReviewStatus(reason: string, riskPoint: string, evidenceSnippet: string): "reviewable" | "unreviewable" {
  if (!reason.trim() || !riskPoint.trim() || !evidenceSnippet.trim()) return "unreviewable";
  return "reviewable";
}

/**
 * Phase C v1.0 freeze — fixed 10 `SHORTLIST_SCENE_KEYS_V0` rows per shortlist candidate.
 * Only `score` + `status` feed `tryBuildShortlistFourDimV0`; `tryBuildShortlistDecisionV0` uses `items` evaluators only — never explain fields on scene rows.
 * `reason` / `riskPoint` / `evidenceSnippet` / `reviewStatus` are audit-only templates (regression-locked in tests).
 * Candidates without successful evaluator output still emit all rows with status=failed (score=0).
 */
export function tryBuildShortlistScenariosV0(
  shortlistBinding: unknown,
  items: ItemRow[],
): ShortlistScenariosV0 | null {
  if (!isBindingV0(shortlistBinding)) return null;
  const binding = shortlistBinding;
  const shortlistIds = binding.shortlistCandidateUserIds;
  if (shortlistIds.length < 2 || shortlistIds.length > 3) return null;
  if (computeShortlistFingerprint(shortlistIds) !== binding.shortlistFingerprint) return null;

  const byId = new Map(items.map((it) => [it.candidateUserId, it]));
  const scenes: ShortlistScenarioRowV0[] = [];
  for (const candidateUserId of shortlistIds) {
    const it = byId.get(candidateUserId);
    const ev = it && it.status === ITEM_STATUS.SUCCEEDED ? readEvaluator(it.evaluator) : null;
    for (const sceneKey of SHORTLIST_SCENE_KEYS_V0) {
      const status: "succeeded" | "failed" = ev ? "succeeded" : "failed";
      const score = ev ? scoreForScene(sceneKey, ev) : 0;
      const reason = toShortReason(sceneKey, status, score);
      const riskPoint = toRiskPoint(sceneKey, status, score);
      const evidenceSnippet = toEvidenceSnippet(sceneKey, candidateUserId, status, score);
      const row: ShortlistScenarioRowV0 = ev
        ? {
            sceneKey,
            candidateUserId,
            score,
            status,
            reason,
            riskPoint,
            evidenceSnippet,
            reviewStatus: toReviewStatus(reason, riskPoint, evidenceSnippet),
          }
        : {
            sceneKey,
            candidateUserId,
            score,
            status,
            reason,
            riskPoint,
            evidenceSnippet,
            reviewStatus: toReviewStatus(reason, riskPoint, evidenceSnippet),
          };
      scenes.push(row);
    }
  }

  return {
    schemaVersion: SHORTLIST_SCENARIOS_V0_SCHEMA,
    shortlistFingerprint: binding.shortlistFingerprint,
    scenes,
  };
}
