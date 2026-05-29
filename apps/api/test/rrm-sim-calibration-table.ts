/**
 * Shared calibration row builder for M1.1 acceptance (table + flags).
 */
import type { RrmSimResult } from "../src/modules/ai-simulation-v1/rrm-sim.types";
import { evaluateRrmSimFromSimulationV2 } from "../src/modules/ai-simulation-v1/rrm-sim.evaluator";
import {
  calibrationAwkwardContextLowS,
  calibrationHighQualityContinueLightly,
  calibrationHighStaticRiskGoodChat,
  calibrationPressureBoundaryRisk,
  calibrationSafeButLowMomentum,
  staticContextHighQuality,
  staticContextHighStaticRisk,
} from "./fixtures/rrm-sim/calibration-fixtures";

export type CalibrationFixtureName =
  | "high_quality_continue_lightly"
  | "safe_but_low_momentum"
  | "awkward_context_low_s"
  | "pressure_boundary_risk"
  | "high_static_risk_but_good_chat";

export type CalibrationResultRow = {
  fixtureName: CalibrationFixtureName;
  simulatedRhythmScore: number;
  suggestedAction: RrmSimResult["suggestedAction"];
  progressionWindow: RrmSimResult["progressionWindow"];
  C_pred: number;
  F_sim: number;
  D_pre: number;
  R_pre: number;
  avg_S_sim: number;
  avg_E_sim: number;
  avg_Q_sim: number;
};

function means(out: RrmSimResult): { avg_S_sim: number; avg_E_sim: number; avg_Q_sim: number } {
  const n = out.scenarioScores.length;
  if (n === 0) return { avg_S_sim: 0, avg_E_sim: 0, avg_Q_sim: 0 };
  let s = 0;
  let e = 0;
  let q = 0;
  for (const r of out.scenarioScores) {
    s += r.S_sim;
    e += r.E_sim;
    q += r.Q_sim;
  }
  return { avg_S_sim: s / n, avg_E_sim: e / n, avg_Q_sim: q / n };
}

function row(fixtureName: CalibrationFixtureName, out: RrmSimResult): CalibrationResultRow {
  const m = means(out);
  return {
    fixtureName,
    simulatedRhythmScore: out.scores.simulatedRhythmScore,
    suggestedAction: out.suggestedAction,
    progressionWindow: out.progressionWindow,
    C_pred: out.scores.C_pred,
    F_sim: out.scores.F_sim,
    D_pre: out.scores.D_pre,
    R_pre: out.scores.R_pre,
    ...m,
  };
}

export function buildFullSevenScenarioCalibrationTable(): CalibrationResultRow[] {
  const hq = evaluateRrmSimFromSimulationV2(calibrationHighQualityContinueLightly(), staticContextHighQuality());
  const low = evaluateRrmSimFromSimulationV2(calibrationSafeButLowMomentum(), null);
  const awk = evaluateRrmSimFromSimulationV2(calibrationAwkwardContextLowS(), null);
  const pr = evaluateRrmSimFromSimulationV2(calibrationPressureBoundaryRisk(), null);
  const st = evaluateRrmSimFromSimulationV2(calibrationHighStaticRiskGoodChat(), staticContextHighStaticRisk());
  return [
    row("high_quality_continue_lightly", hq),
    row("safe_but_low_momentum", low),
    row("awkward_context_low_s", awk),
    row("pressure_boundary_risk", pr),
    row("high_static_risk_but_good_chat", st),
  ];
}

export type CalibrationAcceptanceFlags = {
  score_distribution_too_narrow: boolean;
  boundary_risk_under_detected: boolean;
  D_pre_under_weighted: boolean;
};

/** 非风险样本：不含 pressure_boundary_risk（用于 60–80 集中度检查）。 */
export function evaluateCalibrationAcceptanceFlags(table: CalibrationResultRow[]): CalibrationAcceptanceFlags {
  const byName = Object.fromEntries(table.map((r) => [r.fixtureName, r])) as Record<
    CalibrationFixtureName,
    CalibrationResultRow
  >;
  const nonRisk: CalibrationResultRow[] = [
    byName.high_quality_continue_lightly,
    byName.safe_but_low_momentum,
    byName.awkward_context_low_s,
    byName.high_static_risk_but_good_chat,
  ];
  const inNarrowBand = nonRisk.every(
    (r) => r.simulatedRhythmScore >= 60 && r.simulatedRhythmScore <= 80,
  );
  const pressure = byName.pressure_boundary_risk;
  const boundary_risk_under_detected =
    pressure.R_pre < 0.7 || pressure.suggestedAction !== "stop_or_step_back";
  const D_pre_under_weighted =
    byName.high_static_risk_but_good_chat.simulatedRhythmScore >
    byName.high_quality_continue_lightly.simulatedRhythmScore;
  return {
    score_distribution_too_narrow: inNarrowBand,
    boundary_risk_under_detected,
    D_pre_under_weighted,
  };
}
