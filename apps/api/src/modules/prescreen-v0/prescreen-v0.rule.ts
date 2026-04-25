import type { LiteBand3, LiteOverallVerdict, LiteRiskBand } from "../interaction-simulation-lite/interaction-simulation-lite.types";
import type {
  PrescreenV0Bucket,
  PrescreenV0ReasonCode,
  PrescreenV0StaticTier,
  PrescreenV0VerdictTier,
} from "./prescreen-v0.types";
import {
  PRESCREEN_STATIC_TIER_MID_MIN,
  PRESCREEN_STATIC_TIER_UP_MIN,
  PRESCREEN_W_BANDS,
  PRESCREEN_W_STATIC,
  PRESCREEN_W_VERDICT,
} from "./prescreen-v0.constants";

export function staticTierFromScore(reviewStaticScore: number): PrescreenV0StaticTier {
  if (reviewStaticScore >= PRESCREEN_STATIC_TIER_UP_MIN) return "up";
  if (reviewStaticScore >= PRESCREEN_STATIC_TIER_MID_MIN) return "mid";
  return "down";
}

export function verdictTierFromVerdict(verdict: LiteOverallVerdict): PrescreenV0VerdictTier {
  if (verdict === "worth_exploring") return "up";
  if (verdict === "cautious") return "mid";
  return "down";
}

/**
 * §3.2 bucket truth table (S_tier × verdict tier).
 */
export function bucketFromTiers(
  staticTier: PrescreenV0StaticTier,
  verdictTier: PrescreenV0VerdictTier,
): PrescreenV0Bucket {
  const s = staticTier;
  const v = verdictTier;
  if (s === "up" && v === "up") return "promote";
  if (s === "up" && (v === "mid" || v === "down")) return "neutral";
  if (s === "mid" && v === "up") return "neutral";
  if (s === "mid" && v === "mid") return "neutral";
  if (s === "mid" && v === "down") return "demote";
  if (s === "down" && v === "up") return "neutral";
  if (s === "down" && v === "mid") return "demote";
  return "demote";
}

function band3ToUnit(b: LiteBand3): number {
  if (b === "high") return 1;
  if (b === "medium") return 0.5;
  return 0;
}

function riskBandToUnit(b: LiteRiskBand): number {
  if (b === "high") return 1;
  if (b === "medium") return 0.5;
  return 0;
}

/** §3.3 — B from four axes (0–1 mean). */
export function bandCompositeB(params: {
  pickup: LiteBand3;
  cold: LiteRiskBand;
  mis: LiteRiskBand;
  cont: LiteBand3;
}): number {
  const sum =
    band3ToUnit(params.pickup) +
    riskBandToUnit(params.cold) +
    riskBandToUnit(params.mis) +
    band3ToUnit(params.cont);
  return sum / 4;
}

export function verdictOrdinalV(verdict: LiteOverallVerdict): number {
  if (verdict === "worth_exploring") return 1;
  if (verdict === "cautious") return 0.5;
  return 0;
}

/**
 * §3.3 prescreenScore in [0, 1]; secondary to bucket.
 */
export function computePrescreenScore(params: {
  reviewStaticScore: number;
  verdict: LiteOverallVerdict;
  pickup: LiteBand3;
  cold: LiteRiskBand;
  mis: LiteRiskBand;
  cont: LiteBand3;
}): number {
  const sNorm = Math.min(1, Math.max(0, params.reviewStaticScore / 100));
  const V = verdictOrdinalV(params.verdict);
  const B = bandCompositeB({
    pickup: params.pickup,
    cold: params.cold,
    mis: params.mis,
    cont: params.cont,
  });
  const raw =
    PRESCREEN_W_STATIC * sNorm +
    PRESCREEN_W_VERDICT * V +
    PRESCREEN_W_BANDS * B;
  return Math.round(raw * 1_000_000) / 1_000_000;
}

export function bucketRankForSort(bucket: PrescreenV0Bucket): number {
  if (bucket === "promote") return 0;
  if (bucket === "neutral") return 1;
  return 2;
}

/** Global ordering: bucket promote→neutral→demote, then score desc, then id asc. */
export function comparePrescreenRows(
  a: { candidateUserId: string; bucket: PrescreenV0Bucket; prescreenScore: number },
  b: { candidateUserId: string; bucket: PrescreenV0Bucket; prescreenScore: number },
): number {
  const br = bucketRankForSort(a.bucket) - bucketRankForSort(b.bucket);
  if (br !== 0) return br;
  if (b.prescreenScore !== a.prescreenScore) return b.prescreenScore - a.prescreenScore;
  return a.candidateUserId.localeCompare(b.candidateUserId);
}

export function buildReasonCodes(params: {
  staticTier: PrescreenV0StaticTier;
  verdict: LiteOverallVerdict;
  pickup: LiteBand3;
  cold: LiteRiskBand;
  mis: LiteRiskBand;
  cont: LiteBand3;
  maxCodes: number;
}): PrescreenV0ReasonCode[] {
  const out: PrescreenV0ReasonCode[] = [];
  const push = (c: PrescreenV0ReasonCode) => {
    if (out.length >= params.maxCodes) return;
    if (!out.includes(c)) out.push(c);
  };

  if (params.staticTier === "up") push("static_compat_high");
  else if (params.staticTier === "mid") push("static_compat_mid");
  else push("static_compat_low");

  if (params.verdict === "worth_exploring") push("interaction_verdict_explore");
  else if (params.verdict === "cautious") push("interaction_verdict_cautious");
  else push("interaction_verdict_pause");

  if (params.cold === "high") push("interaction_risk_cold_high");
  if (params.mis === "high") push("interaction_risk_mis_high");
  if (params.pickup === "low") push("interaction_pickup_low");
  if (params.cont === "low") push("interaction_cont_low");

  return out.slice(0, params.maxCodes);
}
