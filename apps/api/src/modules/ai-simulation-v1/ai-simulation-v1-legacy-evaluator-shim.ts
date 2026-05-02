import type { AiSimulationLlmPayloadV2, EvaluatorV1 } from "./ai-simulation-v1.types";
import { RRM_NEXT_STEP_SUITABILITY } from "./ai-simulation-v1-rrm.constants";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, Math.round(n * 10_000) / 10_000));
}

function isNextStepToken(s: string): s is (typeof RRM_NEXT_STEP_SUITABILITY)[number] {
  return (RRM_NEXT_STEP_SUITABILITY as readonly string[]).includes(s.trim());
}

function parseNextStep(raw: string): (typeof RRM_NEXT_STEP_SUITABILITY)[number] | null {
  const t = raw.trim();
  if (isNextStepToken(t)) return t;
  for (const tok of RRM_NEXT_STEP_SUITABILITY) {
    if (t.includes(tok)) return tok;
  }
  return null;
}

/**
 * Maps RRM-ready v2 payload to legacy `EvaluatorV1` for shortlist ranking sidecars
 * (`tryBuildShortlistFourDimV0` in-memory input chain / `tryBuildShortlistDecisionV0`) only.
 */
export function buildLegacyEvaluatorShimFromV2(v2: AiSimulationLlmPayloadV2): EvaluatorV1 {
  const scores = v2.scenarioResults.map((s) => clamp01(s.evaluator.scenarioScore));
  const simulationRankScore = clamp01(scores.reduce((a, b) => a + b, 0) / scores.length);

  const oc = clamp01(v2.overallSimulationAssessment.confidence);
  const confidence: EvaluatorV1["confidence"] =
    oc >= 0.67 ? "high" : oc >= 0.34 ? "medium" : "low";

  const steps = v2.scenarioResults
    .map((s) => parseNextStep(s.signals.nextStepSuitability))
    .filter((x): x is NonNullable<typeof x> => x != null);

  let continue_recommendation: EvaluatorV1["continue_recommendation"] = "hold";
  if (steps.some((x) => x === "stop_or_step_back")) {
    continue_recommendation = "slow_down";
  } else if (steps.filter((x) => x === "slow_down").length >= 2) {
    continue_recommendation = "slow_down";
  } else if (simulationRankScore >= 0.58 && !steps.some((x) => x === "slow_down" || x === "stop_or_step_back")) {
    continue_recommendation = "explore_more";
  } else if (simulationRankScore <= 0.38) {
    continue_recommendation = "slow_down";
  }

  const risk_tags: string[] = [];
  const tag = "rrm_ready_multi_scenario_v1";
  if (risk_tags.length < 6) risk_tags.push(tag);
  const pressure = v2.scenarioResults.some((s) =>
    /过猛|压迫|边界|pushy|pressure/i.test(s.signals.pressureOrBoundaryRisk),
  );
  if (pressure && risk_tags.length < 6) risk_tags.push("pressure_or_boundary_watch");

  const mitigation_hints: string[] = [];
  for (const r of v2.overallSimulationAssessment.mainRisks.slice(0, 3)) {
    const line = typeof r === "string" ? r.trim().slice(0, 80) : "";
    if (line) mitigation_hints.push(line);
  }
  if (mitigation_hints.length === 0) {
    mitigation_hints.push("保持轻松节奏，尊重对方回应速度。");
  }

  return {
    continue_recommendation,
    risk_tags,
    mitigation_hints,
    simulationRankScore,
    confidence,
  };
}
