import type { LiteBand3, LiteRiskBand } from "./interaction-simulation-lite.types";

/** Raw four-axis bands before coherence caps (Step A output shape). */
export type InteractionLiteRawBands = {
  pickup: LiteBand3;
  cold: LiteRiskBand;
  mis: LiteRiskBand;
  cont: LiteBand3;
};

export type InteractionLiteTensionTag =
  | "DUAL_RISK"
  | "PICKUP_VS_COLD"
  | "EXPLORE_VS_FLOW";

const TENSION_ORDER: InteractionLiteTensionTag[] = [
  "DUAL_RISK",
  "PICKUP_VS_COLD",
  "EXPLORE_VS_FLOW",
];

/** Goodness: high > medium > low (for pickup / continuation). */
function capGoodnessAtMost(b: LiteBand3, ceiling: LiteBand3): LiteBand3 {
  const o = { high: 2, medium: 1, low: 0 } as const;
  return o[b] > o[ceiling] ? ceiling : b;
}

/**
 * Step A — v1 决策表（仅 band，不含 oneLiner）。
 * 输入：F=majorFits.length，R=majorRisks.length，S=reviewStaticScore。
 */
export function computeRawBandsV1(
  F: number,
  R: number,
  S: number,
): InteractionLiteRawBands {
  let pickup: LiteBand3;
  if (S >= 62 && F >= 2) pickup = "high";
  else if (S >= 45 && F >= 1) pickup = "medium";
  else pickup = "low";

  let cold: LiteRiskBand;
  if (R >= 4 || S < 40) cold = "high";
  else if (R === 3 || S < 52) cold = "medium";
  else cold = "low";

  let mis: LiteRiskBand;
  if (R >= 3 && S < 55) mis = "high";
  else if (R === 2 || S < 62) mis = "medium";
  else mis = "low";

  let cont: LiteBand3;
  if (S >= 58 && cold !== "high" && mis !== "high") cont = "high";
  else if (S >= 45) cont = "medium";
  else cont = "low";

  return { pickup, cold, mis, cont };
}

/**
 * Tension 标记（基于 raw，cap 前）—— `PICKUP_VS_COLD` 收紧为 **双高** 才触发。
 */
export function detectTensions(raw: InteractionLiteRawBands): InteractionLiteTensionTag[] {
  const out: InteractionLiteTensionTag[] = [];

  if (raw.cold === "high" && raw.mis === "high") {
    out.push("DUAL_RISK");
  }

  if (raw.pickup === "high" && raw.cold === "high") {
    out.push("PICKUP_VS_COLD");
  }

  if ((raw.cont === "high" || raw.cont === "medium") && raw.pickup === "low") {
    out.push("EXPLORE_VS_FLOW");
  }

  return TENSION_ORDER.filter((t) => out.includes(t));
}

/**
 * Step B — caps + tensions；cold/mis 保持 raw，只调 pickup/cont。
 */
export function applyCoherencePass(raw: InteractionLiteRawBands): {
  bands: InteractionLiteRawBands;
  tensions: InteractionLiteTensionTag[];
} {
  const tensions = detectTensions(raw);
  const bands: InteractionLiteRawBands = { ...raw };

  if (bands.cold === "high") {
    bands.cont = capGoodnessAtMost(bands.cont, "medium");
  }
  if (bands.mis === "high") {
    bands.cont = capGoodnessAtMost(bands.cont, "medium");
  }
  if (bands.cold === "high" && bands.mis === "high") {
    bands.pickup = capGoodnessAtMost(bands.pickup, "medium");
    bands.cont = capGoodnessAtMost(bands.cont, "low");
  }
  if (raw.pickup === "high" && raw.cold === "high") {
    bands.pickup = capGoodnessAtMost(bands.pickup, "medium");
  }
  if (raw.pickup === "low" && raw.cont !== "low") {
    bands.cont = capGoodnessAtMost(bands.cont, "medium");
  }

  return { bands, tensions };
}
