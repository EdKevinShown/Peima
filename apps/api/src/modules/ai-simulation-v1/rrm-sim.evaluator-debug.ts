/**
 * M1.3-M1 — read-only debug wrapper for RRM-Sim evaluator.
 * Used by calibration tooling / tests only; not wired to admin or viewer HTTP responses.
 */
import type { AiSimulationLlmPayloadV2 } from "./ai-simulation-v1.types";
import { RRM_NEXT_STEP_SUITABILITY, RRM_SCENARIO_KEYS_ORDERED } from "./ai-simulation-v1-rrm.constants";
import {
  RRM_SIM_LOW_MEAN_Q_SOFT_PROGRESS_CAP,
  RRM_SIM_PROGRESSION_SCORE_OPEN_MIN,
  RRM_SIM_PROGRESSION_SCORE_STRONG_OPEN_MIN,
  RRM_SIM_PROGRESSION_SCORE_WEAK_OPEN_MIN,
  RRM_SIM_RESPECT_R_PRE_GATE,
  RRM_SIM_SCENARIO_WEIGHTS,
  RRM_SIM_STATIC_D_PRE_GATE,
  type RrmSimProgressionWindow,
  type RrmSimSuggestedAction,
} from "./rrm-sim.constants";
import type { RrmSimResult, RrmSimScenarioScoreRow } from "./rrm-sim.types";
import { aggregateRfiSim, clamp, computeRfiScenario, rfiToSimulatedRhythmScore } from "./rrm-sim-formula";
import {
  extractCPred,
  extractDPre,
  extractEPerScenario,
  extractFGlobal,
  extractQPerScenario,
  extractRPre,
  extractRScenario,
  extractSPerScenario,
} from "./rrm-sim-extractor";
import { evaluateRrmSimFromSimulationV2, isFullRrmSimEvaluatorInput } from "./rrm-sim.evaluator";

function isNextStepToken(s: string): s is RrmSimSuggestedAction {
  return (RRM_NEXT_STEP_SUITABILITY as readonly string[]).includes(s.trim());
}

function parseSuggestedAction(raw: string): RrmSimSuggestedAction {
  const t = raw.trim();
  if (isNextStepToken(t)) return t;
  for (const tok of RRM_NEXT_STEP_SUITABILITY) {
    if (t.includes(tok)) return tok as RrmSimSuggestedAction;
  }
  return "maintain";
}

function progressionWindowFromSimulatedRhythmScore(score: number): RrmSimProgressionWindow {
  if (score < RRM_SIM_PROGRESSION_SCORE_WEAK_OPEN_MIN) return "closed";
  if (score < RRM_SIM_PROGRESSION_SCORE_OPEN_MIN) return "weak_open";
  if (score < RRM_SIM_PROGRESSION_SCORE_STRONG_OPEN_MIN) return "open";
  return "strong_open";
}

function suggestedActionFromSimulatedRhythmScore(score: number): RrmSimSuggestedAction {
  if (score < 35) return "slow_down";
  if (score < 45) return "slow_down";
  if (score < 60) return "maintain";
  if (score < 75) return "continue_lightly";
  return "soft_progress";
}

function capSuggestedForLowMeanQ(meanQ: number, action: RrmSimSuggestedAction): RrmSimSuggestedAction {
  if (meanQ >= RRM_SIM_LOW_MEAN_Q_SOFT_PROGRESS_CAP) return action;
  if (action === "soft_progress") return "continue_lightly";
  return action;
}

export type RrmSimScenarioDebugRow = {
  scenarioKey: string;
  index: number;
  weight: number;
  A: number;
  S: number;
  E: number;
  Q: number;
  R_scenario: number;
  RFI_scenario: number;
  weightedContribution: number;
};

export type RrmSimDebugIntermediate = {
  scores: {
    C_pred: number;
    F_sim: number;
    D_pre: number;
    R_pre: number;
    RFI_sim: number;
    simulatedRhythmScore: number;
  };
  mapping: {
    rawRfiSim: number;
    clampedRfiSim: number;
    mappedRhythmBeforeGates: number;
    finalRhythmScore: number;
  };
  gates: {
    respectGateApplied: boolean;
    dPreGateApplied: boolean;
    meanQCapApplied: boolean;
  };
  scenarioDebug: RrmSimScenarioDebugRow[];
};

export type RrmSimDebugResult = {
  ok: boolean;
  fallbackUsed: boolean;
  production: RrmSimResult;
  debug?: RrmSimDebugIntermediate;
  error?: {
    reason: string;
  };
};

/**
 * Runs production evaluator and, when non-fallback, attaches deterministic debug intermediates.
 * Does not change `evaluateRrmSimFromSimulationV2` behavior or return type.
 */
export function evaluateRrmSimDebugFromSimulationV2(
  transcriptLite: unknown,
  staticContext?: Record<string, unknown> | null,
): RrmSimDebugResult {
  const production = evaluateRrmSimFromSimulationV2(transcriptLite, staticContext);

  if (production.fallbackUsed || !isFullRrmSimEvaluatorInput(transcriptLite)) {
    return { ok: true, fallbackUsed: true, production };
  }

  try {
    const payload = transcriptLite as AiSimulationLlmPayloadV2;
    const ctx = staticContext ?? null;

    const C_pred = extractCPred(payload, ctx);
    const F_sim = extractFGlobal(payload);
    const D_pre = extractDPre(payload, ctx);
    const R_pre = extractRPre(payload, ctx);

    const weights = RRM_SCENARIO_KEYS_ORDERED.map((k) => RRM_SIM_SCENARIO_WEIGHTS[k]);
    const scenarioScores: RrmSimScenarioScoreRow[] = [];
    const rfis: number[] = [];
    const scenarioDebug: RrmSimScenarioDebugRow[] = [];

    let sumWeightedUnclamped = 0;
    let idx = 0;
    for (const row of payload.scenarioResults) {
      const A = row.scenarioApproachIntensity;
      const S = extractSPerScenario(row);
      const E = extractEPerScenario(row);
      const Q = extractQPerScenario(row);
      const R_scenario = extractRScenario(row);
      const RFI_scenario = computeRfiScenario({
        A,
        C_pred,
        S,
        E,
        F: F_sim,
        Q,
        D_pre,
        R_pre,
      });
      rfis.push(RFI_scenario);
      const w = weights[idx] ?? 0;
      sumWeightedUnclamped += RFI_scenario * w;
      scenarioDebug.push({
        scenarioKey: String(row.scenario),
        index: idx,
        weight: w,
        A,
        S,
        E,
        Q,
        R_scenario,
        RFI_scenario,
        weightedContribution: RFI_scenario * w,
      });
      scenarioScores.push({
        scenario: row.scenario,
        A_scenario: A,
        S_sim: S,
        E_sim: E,
        Q_sim: Q,
        R_scenario,
        RFI_scenario,
        suggestedAction: parseSuggestedAction(row.signals.nextStepSuitability),
      });
      idx += 1;
    }

    const clampedRfiSim = aggregateRfiSim(rfis, weights);
    const rawRfiSim = sumWeightedUnclamped;

    let mappedRhythmBeforeGates = rfiToSimulatedRhythmScore(clampedRfiSim);
    mappedRhythmBeforeGates = clamp(mappedRhythmBeforeGates, 0, 100);

    const meanQ = scenarioScores.reduce((a, r) => a + r.Q_sim, 0) / 7;

    const respectGateApplied = R_pre >= RRM_SIM_RESPECT_R_PRE_GATE;
    let simulatedRhythmScore = mappedRhythmBeforeGates;
    if (respectGateApplied) {
      simulatedRhythmScore = Math.min(simulatedRhythmScore, 25);
    }

    const dPreGateApplied = !respectGateApplied && D_pre >= RRM_SIM_STATIC_D_PRE_GATE;

    let meanQCapApplied = false;
    if (!respectGateApplied && !dPreGateApplied) {
      const uncapped = suggestedActionFromSimulatedRhythmScore(simulatedRhythmScore);
      const capped = capSuggestedForLowMeanQ(meanQ, uncapped);
      meanQCapApplied = uncapped !== capped;
    }

    const finalRhythmScore = simulatedRhythmScore;

    const debug: RrmSimDebugIntermediate = {
      scores: {
        C_pred,
        F_sim,
        D_pre,
        R_pre,
        RFI_sim: clampedRfiSim,
        simulatedRhythmScore: finalRhythmScore,
      },
      mapping: {
        rawRfiSim,
        clampedRfiSim,
        mappedRhythmBeforeGates,
        finalRhythmScore,
      },
      gates: {
        respectGateApplied,
        dPreGateApplied,
        meanQCapApplied,
      },
      scenarioDebug,
    };

    if (finalRhythmScore !== production.scores.simulatedRhythmScore) {
      return {
        ok: false,
        fallbackUsed: false,
        production,
        error: {
          reason: `debug_rhythm_mismatch: debug=${finalRhythmScore} production=${production.scores.simulatedRhythmScore}`,
        },
      };
    }

    const tol = 1e-6;
    const near = (a: number, b: number) => Math.abs(a - b) <= tol;
    if (
      !near(C_pred, production.scores.C_pred) ||
      !near(F_sim, production.scores.F_sim) ||
      !near(D_pre, production.scores.D_pre) ||
      !near(R_pre, production.scores.R_pre) ||
      !near(clampedRfiSim, production.scores.RFI_sim)
    ) {
      return {
        ok: false,
        fallbackUsed: false,
        production,
        error: { reason: "debug_scores_mismatch_with_production" },
      };
    }

    return { ok: true, fallbackUsed: false, production, debug };
  } catch (e) {
    return {
      ok: false,
      fallbackUsed: production.fallbackUsed,
      production,
      error: { reason: e instanceof Error ? e.message : String(e) },
    };
  }
}
