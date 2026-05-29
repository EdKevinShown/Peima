import { RRM_SIM_F_SIM_CAP } from "./rrm-sim.constants";

export function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

/**
 * Per-scenario RFI per product spec (A = A_scenario, C = C_pred global).
 * When A <= C: RFI = S*E*A + F*Q - D_pre
 * When A > C: P = 1+(1-S)+(1-E)+R_pre; RFI = F*Q - D_pre - (A-C)*P
 */
export function computeRfiScenario(params: {
  A: number;
  C_pred: number;
  S: number;
  E: number;
  F: number;
  Q: number;
  D_pre: number;
  R_pre: number;
}): number {
  const { A, C_pred, S, E, F, Q, D_pre, R_pre } = params;
  const a = clamp01(A);
  const c = clamp01(C_pred);
  const s = clamp01(S);
  const e = clamp01(E);
  const f = clamp01(F);
  const q = clamp01(Q);
  const d = clamp01(D_pre);
  const r = clamp01(R_pre);
  if (a <= c) {
    return s * e * a + f * q - d;
  }
  const P = 1 + (1 - s) + (1 - e) + r;
  return f * q - d - (a - c) * P;
}

export function aggregateRfiSim(
  perScenarioRfi: number[],
  weights: number[],
): number {
  let sum = 0;
  for (let i = 0; i < perScenarioRfi.length; i += 1) {
    sum += perScenarioRfi[i]! * weights[i]!;
  }
  return clamp(sum, -1, 1);
}

export function rfiToSimulatedRhythmScore(rfiSim: number): number {
  const x = clamp(rfiSim, -1, 1);
  return Math.round(((x + 1) / 2) * 100);
}

export function applyFsimCap(fRaw: number): number {
  return Math.min(RRM_SIM_F_SIM_CAP, clamp01(fRaw));
}
