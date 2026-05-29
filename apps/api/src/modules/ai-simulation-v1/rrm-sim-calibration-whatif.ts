/**
 * M1.3-M2/M5 — offline calibration what-if helpers (read-only).
 * Uses existing `RrmSimResult.scenarioScores` + global scores from admin-enriched payloads;
 * does not change production evaluator or formula modules.
 */
import type { AiSimulationLlmPayloadV2 } from "./ai-simulation-v1.types";
import { RRM_SCENARIO_KEYS_ORDERED } from "./ai-simulation-v1-rrm.constants";
import {
  RRM_SIM_LOW_MEAN_Q_SOFT_PROGRESS_CAP,
  RRM_SIM_PROGRESSION_SCORE_OPEN_MIN,
  RRM_SIM_PROGRESSION_SCORE_STRONG_OPEN_MIN,
  RRM_SIM_PROGRESSION_SCORE_WEAK_OPEN_MIN,
  RRM_SIM_RESPECT_R_PRE_GATE,
  RRM_SIM_SCENARIO_WEIGHTS,
  RRM_SIM_STATIC_D_PRE_CLOSED_WINDOW,
  RRM_SIM_STATIC_D_PRE_GATE,
} from "./rrm-sim.constants";
import type { RrmSimProgressionWindow, RrmSimSuggestedAction } from "./rrm-sim.constants";
import type { RrmSimResult, RrmSimScenarioScoreRow } from "./rrm-sim.types";
import { aggregateRfiSim, clamp, clamp01, computeRfiScenario, rfiToSimulatedRhythmScore } from "./rrm-sim-formula";
import { extractDPre } from "./rrm-sim-extractor";
import { isFullRrmSimEvaluatorInput } from "./rrm-sim.evaluator";

const productionWeights = (): number[] => RRM_SCENARIO_KEYS_ORDERED.map((k) => RRM_SIM_SCENARIO_WEIGHTS[k]);

/** Canonical 7-row order; null if any scenario missing (e.g. legacy 3-scenario payloads). */
export function orderedScenarioRows(rr: RrmSimResult): RrmSimScenarioScoreRow[] | null {
  if (rr.fallbackUsed) return null;
  const byKey = new Map(rr.scenarioScores.map((s) => [s.scenario, s]));
  const ordered: RrmSimScenarioScoreRow[] = [];
  for (const k of RRM_SCENARIO_KEYS_ORDERED) {
    const row = byKey.get(k);
    if (!row) return null;
    ordered.push(row);
  }
  return ordered;
}

export function canRunRrmWhatIf(rr: RrmSimResult | null | undefined): boolean {
  if (!rr || rr.fallbackUsed) return false;
  return orderedScenarioRows(rr) != null;
}

export type WhatIfRhythmResult = {
  simulatedRhythmScore: number;
  RFI_sim: number;
  dPreBefore?: number;
  dPreAfter?: number;
  staticLift?: number;
  cappedLift?: number;
  proxyNote?: string;
  suggestedAction?: RrmSimSuggestedAction;
  progressionWindow?: RrmSimProgressionWindow;
};

function rhythmFromRfis(rfis: number[], weights: number[], R_pre: number): { simulatedRhythmScore: number; RFI_sim: number } {
  const RFI_sim = clamp(aggregateRfiSim(rfis, weights), -1, 1);
  let rhythm = rfiToSimulatedRhythmScore(RFI_sim);
  rhythm = clamp(rhythm, 0, 100);
  if (R_pre >= RRM_SIM_RESPECT_R_PRE_GATE) {
    rhythm = Math.min(rhythm, 25);
  }
  return { simulatedRhythmScore: rhythm, RFI_sim };
}

function meanQFromRows(rows: RrmSimScenarioScoreRow[]): number {
  return rows.reduce((a, row) => a + row.Q_sim, 0) / rows.length;
}

/** Mirrors evaluator output-layer branching (read-only duplicate for offline reports). */
export function deriveSuggestedActionAndProgressionWindow(
  simulatedRhythmScore: number,
  R_pre: number,
  D_pre: number,
  meanQ: number,
): { suggestedAction: RrmSimSuggestedAction; progressionWindow: RrmSimProgressionWindow } {
  if (R_pre >= RRM_SIM_RESPECT_R_PRE_GATE) {
    return { suggestedAction: "stop_or_step_back", progressionWindow: "closed" };
  }
  if (D_pre >= RRM_SIM_STATIC_D_PRE_GATE) {
    return {
      suggestedAction: "slow_down",
      progressionWindow: D_pre >= RRM_SIM_STATIC_D_PRE_CLOSED_WINDOW ? "closed" : "weak_open",
    };
  }
  let progressionWindow: RrmSimProgressionWindow;
  if (simulatedRhythmScore < RRM_SIM_PROGRESSION_SCORE_WEAK_OPEN_MIN) progressionWindow = "closed";
  else if (simulatedRhythmScore < RRM_SIM_PROGRESSION_SCORE_OPEN_MIN) progressionWindow = "weak_open";
  else if (simulatedRhythmScore < RRM_SIM_PROGRESSION_SCORE_STRONG_OPEN_MIN) progressionWindow = "open";
  else progressionWindow = "strong_open";

  let suggestedAction: RrmSimSuggestedAction;
  if (simulatedRhythmScore < 35) suggestedAction = "slow_down";
  else if (simulatedRhythmScore < 45) suggestedAction = "slow_down";
  else if (simulatedRhythmScore < 60) suggestedAction = "maintain";
  else if (simulatedRhythmScore < 75) suggestedAction = "continue_lightly";
  else suggestedAction = "soft_progress";

  if (meanQ < RRM_SIM_LOW_MEAN_Q_SOFT_PROGRESS_CAP && suggestedAction === "soft_progress") {
    suggestedAction = "continue_lightly";
  }
  return { suggestedAction, progressionWindow };
}

function buildWhatIfWithD(
  rr: RrmSimResult,
  Dp: number,
  meta: { staticLift?: number; cappedLift?: number; proxyNote?: string },
): WhatIfRhythmResult | null {
  const rows = orderedScenarioRows(rr);
  if (!rows) return null;
  const w = productionWeights();
  const rfis = scenarioRfisFromOrdered(rows, {
    C_pred: rr.scores.C_pred,
    F: rr.scores.F_sim,
    D_pre: Dp,
    R_pre: rr.scores.R_pre,
  });
  const { simulatedRhythmScore, RFI_sim } = rhythmFromRfis(rfis, w, rr.scores.R_pre);
  const meanQ = meanQFromRows(rows);
  const { suggestedAction, progressionWindow } = deriveSuggestedActionAndProgressionWindow(
    simulatedRhythmScore,
    rr.scores.R_pre,
    Dp,
    meanQ,
  );
  return {
    simulatedRhythmScore,
    RFI_sim,
    dPreBefore: rr.scores.D_pre,
    dPreAfter: Dp,
    staticLift: meta.staticLift,
    cappedLift: meta.cappedLift,
    proxyNote: meta.proxyNote,
    suggestedAction,
    progressionWindow,
  };
}

/** `extractDPre(payload, null)`; null if payload not full RRM-ready v2. */
export function transcriptOnlyDPre(transcriptLite: unknown): number | null {
  if (!isFullRrmSimEvaluatorInput(transcriptLite)) return null;
  return extractDPre(transcriptLite as AiSimulationLlmPayloadV2, null);
}

/** True when every succeeded non-fallback row that can run what-if has a transcript-only D_pre (no fabrication for D_tx-based proxies). */
export function everyUsableRowHasTranscriptOnlyDPre(
  results: Array<{ status?: string; rrmSimResult?: RrmSimResult; transcriptLite?: unknown }>,
): boolean {
  for (const r of results) {
    if (r.status !== "succeeded" || !r.rrmSimResult || r.rrmSimResult.fallbackUsed !== false) continue;
    if (!canRunRrmWhatIf(r.rrmSimResult)) continue;
    if (transcriptOnlyDPre(r.transcriptLite) == null) return false;
  }
  return true;
}

/** M1.3-M5 — soft cap above 0.8 (offline spec). */
export function computeDPreSoftCap(D_admin: number): number {
  if (D_admin <= 0.8) return D_admin;
  return clamp01(0.8 + (D_admin - 0.8) * 0.35);
}

/** M1.3-M5 — static lift cap (pure; for tests). */
export function computeDPreStaticCapFromTxAdmin(D_tx: number, D_admin: number, cap = 0.25): number {
  const lift = Math.max(0, D_admin - D_tx);
  const cappedLift = Math.min(lift, cap);
  return clamp01(D_tx + cappedLift);
}

/** M1.3-M5 — dedup proxy via capped static lift (pure; for tests). */
export function computeDPreMajorRiskDedupProxyFromTxAdmin(D_tx: number, D_admin: number): number {
  const staticLift = Math.max(0, D_admin - D_tx);
  return clamp01(D_tx + Math.min(staticLift, 0.18));
}

export function whatIfDPreSoftCapProxy(rr: RrmSimResult): WhatIfRhythmResult | null {
  const Dp = computeDPreSoftCap(rr.scores.D_pre);
  return buildWhatIfWithD(rr, Dp, {
    staticLift: Math.max(0, rr.scores.D_pre - Dp),
    proxyNote: "d_pre_soft_cap_above_0.8_slope_0.35",
  });
}

/**
 * M1.3-M5 / M1.3-M12 — static lift hard-cap on (D_admin − D_tx).
 * @param staticLiftCap max static lift contribution (default **0.25**; M12 reads **`RRM_D_PRE_STATIC_LIFT_CAP`** in shadow entrypoints).
 */
export function whatIfDPreStaticCapProxy(
  rr: RrmSimResult,
  transcriptLite: unknown,
  staticLiftCap: number = 0.25,
): WhatIfRhythmResult | null {
  const D_tx = transcriptOnlyDPre(transcriptLite);
  if (D_tx == null) return null;
  const cap = Number.isFinite(staticLiftCap) && staticLiftCap > 0 ? staticLiftCap : 0.25;
  const D_admin = rr.scores.D_pre;
  const lift = Math.max(0, D_admin - D_tx);
  const capped = Math.min(lift, cap);
  const Dp = clamp01(D_tx + capped);
  return buildWhatIfWithD(rr, Dp, {
    staticLift: lift,
    cappedLift: capped,
    proxyNote: `d_pre_static_cap_max_lift_${cap}`,
  });
}

export function whatIfDPreMajorRiskDedupProxy(rr: RrmSimResult, transcriptLite: unknown): WhatIfRhythmResult | null {
  const D_tx = transcriptOnlyDPre(transcriptLite);
  if (D_tx == null) return null;
  const D_admin = rr.scores.D_pre;
  const lift = Math.max(0, D_admin - D_tx);
  const capped = Math.min(lift, 0.18);
  const Dp = clamp01(D_tx + capped);
  return buildWhatIfWithD(rr, Dp, {
    staticLift: lift,
    cappedLift: capped,
    proxyNote: "static_lift_capped_as_dedup_proxy_max_0.18",
  });
}

function scenarioRfisFromOrdered(
  rows: RrmSimScenarioScoreRow[],
  opts: { C_pred: number; F: number; D_pre: number; R_pre: number },
): number[] {
  return rows.map((row) =>
    computeRfiScenario({
      A: row.A_scenario,
      C_pred: opts.C_pred,
      S: row.S_sim,
      E: row.E_sim,
      F: opts.F,
      Q: row.Q_sim,
      D_pre: opts.D_pre,
      R_pre: opts.R_pre,
    }),
  );
}

/** Offline proxy: D_pre' = clamp01(D_pre * 0.75) in RFI only; respect gate uses original R_pre from `rr`. */
export function whatIfLowerDPrePenalty(rr: RrmSimResult): { simulatedRhythmScore: number; RFI_sim: number } | null {
  const rows = orderedScenarioRows(rr);
  if (!rows) return null;
  const w = productionWeights();
  const Dp = clamp01(rr.scores.D_pre * 0.75);
  const rfis = scenarioRfisFromOrdered(rows, {
    C_pred: rr.scores.C_pred,
    F: rr.scores.F_sim,
    D_pre: Dp,
    R_pre: rr.scores.R_pre,
  });
  return rhythmFromRfis(rfis, w, rr.scores.R_pre);
}

/** Offline proxy: F' = min(0.95, F + 0.07) clamp01 in RFI only. */
export function whatIfLowerFCapEffect(rr: RrmSimResult): { simulatedRhythmScore: number; RFI_sim: number } | null {
  const rows = orderedScenarioRows(rr);
  if (!rows) return null;
  const w = productionWeights();
  const Fp = Math.min(0.95, clamp01(rr.scores.F_sim + 0.07));
  const rfis = scenarioRfisFromOrdered(rows, {
    C_pred: rr.scores.C_pred,
    F: Fp,
    D_pre: rr.scores.D_pre,
    R_pre: rr.scores.R_pre,
  });
  return rhythmFromRfis(rfis, w, rr.scores.R_pre);
}

/** Offline proxy: C_pred' = clamp01(C_pred + 0.05). */
export function whatIfCPredWeightingVariant(rr: RrmSimResult): { simulatedRhythmScore: number; RFI_sim: number } | null {
  const rows = orderedScenarioRows(rr);
  if (!rows) return null;
  const w = productionWeights();
  const Cp = clamp01(rr.scores.C_pred + 0.05);
  const rfis = scenarioRfisFromOrdered(rows, {
    C_pred: Cp,
    F: rr.scores.F_sim,
    D_pre: rr.scores.D_pre,
    R_pre: rr.scores.R_pre,
  });
  return rhythmFromRfis(rfis, w, rr.scores.R_pre);
}

/**
 * Offline alternate weights: boost personal_sharing + emotional_support_light, compress others, renormalize.
 * Uses stored per-scenario `RFI_scenario` from `rr` (no re-run of scene extractors).
 */
export function whatIfPerScenarioWeightVariant(rr: RrmSimResult): {
  simulatedRhythmScore: number;
  RFI_sim: number;
  weightsUsed: number[];
  note: string;
} | null {
  const rows = orderedScenarioRows(rr);
  if (!rows) return null;
  const base = productionWeights();
  const keys = RRM_SCENARIO_KEYS_ORDERED;
  const boosted = base.map((bw, i) => {
    const k = keys[i];
    if (k === "personal_sharing" || k === "emotional_support_light") return bw * 1.28;
    return bw * 0.92;
  });
  const sum = boosted.reduce((a, b) => a + b, 0);
  const w = boosted.map((x) => x / sum);
  const rfisStored = rows.map((row) => row.RFI_scenario);
  const RFI_sim = aggregateRfiSim(rfisStored, w);
  let rhythm = rfiToSimulatedRhythmScore(RFI_sim);
  rhythm = clamp(rhythm, 0, 100);
  if (rr.scores.R_pre >= RRM_SIM_RESPECT_R_PRE_GATE) {
    rhythm = Math.min(rhythm, 25);
  }
  return {
    simulatedRhythmScore: rhythm,
    RFI_sim: RFI_sim,
    weightsUsed: w,
    note: "Re-aggregated stored RFI_scenario with offline-only normalized weights (not production RRM_SIM_SCENARIO_WEIGHTS).",
  };
}

export function debugSummaryFromAdminResults(results: Array<{ rrmSimResult?: RrmSimResult }>): {
  avgDPre: number;
  avgFSim: number;
  avgCPred: number;
  avgRPre: number;
} {
  const rows = results
    .map((r) => r.rrmSimResult)
    .filter((x): x is RrmSimResult => Boolean(x && x.fallbackUsed === false && x.scores));
  if (!rows.length) {
    return { avgDPre: 0, avgFSim: 0, avgCPred: 0, avgRPre: 0 };
  }
  const n = rows.length;
  const sum = rows.reduce(
    (a, rr) => ({
      d: a.d + rr.scores.D_pre,
      f: a.f + rr.scores.F_sim,
      c: a.c + rr.scores.C_pred,
      r: a.r + rr.scores.R_pre,
    }),
    { d: 0, f: 0, c: 0, r: 0 },
  );
  return {
    avgDPre: sum.d / n,
    avgFSim: sum.f / n,
    avgCPred: sum.c / n,
    avgRPre: sum.r / n,
  };
}

/** Averages D_pre before/after mapping and mean static lift (D_admin − D_tx) over usable rows. */
export function debugSummaryDPreProxyFromMapped(
  results: Array<{ rrmSimResult?: RrmSimResult; status?: string; transcriptLite?: unknown }>,
  mapped: Array<{ rrmSimResult?: RrmSimResult; status?: string }>,
): { avgDPreBefore: number; avgDPreAfter: number; avgStaticLift: number; avgFSim: number; avgCPred: number; avgRPre: number } {
  let n = 0;
  let sb = 0;
  let sa = 0;
  let sl = 0;
  let sf = 0;
  let sc = 0;
  let sr = 0;
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    const m = mapped[i];
    if (r.status !== "succeeded" || !r.rrmSimResult || r.rrmSimResult.fallbackUsed !== false) continue;
    if (!m?.rrmSimResult || m.rrmSimResult.fallbackUsed !== false) continue;
    const br = r.rrmSimResult.scores.D_pre;
    const ar = m.rrmSimResult.scores.D_pre;
    if (typeof br !== "number" || typeof ar !== "number") continue;
    n += 1;
    sb += br;
    sa += ar;
    const D_tx = transcriptOnlyDPre(r.transcriptLite);
    sl += D_tx != null ? Math.max(0, br - D_tx) : 0;
    sf += r.rrmSimResult.scores.F_sim;
    sc += r.rrmSimResult.scores.C_pred;
    sr += r.rrmSimResult.scores.R_pre;
  }
  if (!n) {
    return { avgDPreBefore: 0, avgDPreAfter: 0, avgStaticLift: 0, avgFSim: 0, avgCPred: 0, avgRPre: 0 };
  }
  return {
    avgDPreBefore: sb / n,
    avgDPreAfter: sa / n,
    avgStaticLift: sl / n,
    avgFSim: sf / n,
    avgCPred: sc / n,
    avgRPre: sr / n,
  };
}

export function debugSummaryProxyInputs(
  kind: "lower_d_pre_penalty" | "lower_f_cap_effect" | "c_pred_weighting_variant" | "per_scenario_weight_variant",
  results: Array<{ rrmSimResult?: RrmSimResult }>,
): { avgDPre: number; avgFSim: number; avgCPred: number; avgRPre: number } {
  const rows = results
    .map((r) => r.rrmSimResult)
    .filter((x): x is RrmSimResult => Boolean(x && x.fallbackUsed === false && x.scores));
  if (!rows.length) return { avgDPre: 0, avgFSim: 0, avgCPred: 0, avgRPre: 0 };
  const n = rows.length;
  let sd = 0;
  let sf = 0;
  let sc = 0;
  let sr = 0;
  for (const rr of rows) {
    sr += rr.scores.R_pre;
    if (kind === "lower_d_pre_penalty") {
      sd += clamp01(rr.scores.D_pre * 0.75);
      sf += rr.scores.F_sim;
      sc += rr.scores.C_pred;
    } else if (kind === "lower_f_cap_effect") {
      sd += rr.scores.D_pre;
      sf += Math.min(0.95, clamp01(rr.scores.F_sim + 0.07));
      sc += rr.scores.C_pred;
    } else if (kind === "c_pred_weighting_variant") {
      sd += rr.scores.D_pre;
      sf += rr.scores.F_sim;
      sc += clamp01(rr.scores.C_pred + 0.05);
    } else {
      sd += rr.scores.D_pre;
      sf += rr.scores.F_sim;
      sc += rr.scores.C_pred;
    }
  }
  return { avgDPre: sd / n, avgFSim: sf / n, avgCPred: sc / n, avgRPre: sr / n };
}
