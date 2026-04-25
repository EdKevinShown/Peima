import type { MatchReviewStaticSummaryPayload } from "../match-review-ai/match-review-ai.types";
import type {
  InteractionSimulationLiteAxesDto,
  InteractionSimulationLiteOverallDto,
  LiteBand3,
  LiteConfidence,
  LiteOverallVerdict,
  LiteRiskBand,
} from "./interaction-simulation-lite.types";
import {
  applyCoherencePass,
  computeRawBandsV1,
  type InteractionLiteRawBands,
  type InteractionLiteTensionTag,
} from "./interaction-simulation-lite-coherence";

function confidenceFromFrs(
  F: number,
  R: number,
  S: number,
): LiteConfidence {
  if (F >= 2 && R <= 2 && S >= 55) return "high";
  if (S >= 45) return "medium";
  return "low";
}

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function oneLinerPickup(band: LiteBand3): string {
  if (band === "high") return "从问卷画像上看，双方节奏与表达习惯较容易互相接住话头。";
  if (band === "medium")
    return "整体还能聊开，但个别维度需要多一点耐心或澄清，避免各说各话。";
  return "开场阶段可能更需要主动破冰与具体话题，减少抽象泛泛而谈。";
}

function oneLinerCold(band: LiteRiskBand): string {
  if (band === "low") return "冷场风险相对较低，维持基本互动通常不太吃力。";
  if (band === "medium")
    return "若话题飘在表面或回应偏短，偶尔可能出现小冷场，可准备一两个轻松话题。";
  return "冷场风险偏高，建议放慢节奏、用开放式问题把对话拉回到彼此感受。";
}

function oneLinerMisread(band: LiteRiskBand): string {
  if (band === "low") return "误解风险相对可控，表达上直球一点通常问题不大。";
  if (band === "medium")
    return "个别表达习惯差异可能带来小误会，重要点可复述确认一次。";
  return "误解风险偏高，建议少用暗示与反话，关键信息尽量说清楚。";
}

function oneLinerContinuation(band: LiteBand3): string {
  if (band === "high") return "综合信号偏积极，值得用几次聊天再感受一下真实相处。";
  if (band === "medium")
    return "信号中性偏多，不必急于下结论，可先观察互动是否越来越顺。";
  return "当前信号偏保守，是否继续了解可更多依赖线下感受与边界感。";
}

/** Step C — 只吃 cap 后的 bands。 */
export function verdictFromAxes(bands: InteractionLiteRawBands): LiteOverallVerdict {
  if (bands.cold === "high" || bands.mis === "high") {
    return "pause";
  }
  if (bands.cont === "low") {
    return "pause";
  }
  if (bands.cont === "high" && bands.pickup !== "low") {
    return "worth_exploring";
  }
  return "cautious";
}

const VERDICT_LEAD_ZH: Record<LiteOverallVerdict, string> = {
  worth_exploring: "综合判断：目前更适合带着好奇、小步加深了解。",
  cautious: "综合判断：先保持轻松节奏，用几次互动感受彼此是否同频。",
  pause: "综合判断：现阶段更适合放慢或暂停推进，优先照顾自身舒适度。",
};

const TENSION_COPY_ZH: Record<InteractionLiteTensionTag, string> = {
  DUAL_RISK:
    "画像侧同时提示「聊干」与「说岔」两类压力：首轮建议更短、更具体，并多确认对方意思。",
  PICKUP_VS_COLD:
    "「容易接住话头」与「不容易冷场」不一定总是一致：接住话头后仍要主动换话题、把聊天拉长一点。",
  EXPLORE_VS_FLOW:
    "虽有「再试试聊几次」的信号，但首轮接话对齐偏弱：需要用更具体的话题与反馈，验证是否真的聊得起来。",
};

function bridgeFromAxes(bands: InteractionLiteRawBands): string {
  if (bands.cold === "high") {
    return "当前最需要注意的是：维持聊天气氛与话题延续。";
  }
  if (bands.mis === "high") {
    return "当前最需要注意的是：关键信息说清楚、减少绕弯与暗示。";
  }
  if (bands.pickup === "high") {
    return "首轮互动上，对齐与接话相对更有利。";
  }
  if (bands.pickup === "low") {
    return "首轮需要更多主动破冰与具体话题，避免停留在抽象层。";
  }
  return "整体没有单一强项；建议用轻松话题小步试探。";
}

/**
 * Step D — `labelFitSummary` 仅作末句 trailer，不抢主叙事。
 */
export function composeSummaryV2(params: {
  verdict: LiteOverallVerdict;
  tensions: InteractionLiteTensionTag[];
  bands: InteractionLiteRawBands;
  labelFitSummary: string;
}): string {
  const parts: string[] = [];
  parts.push(VERDICT_LEAD_ZH[params.verdict]);

  for (const t of params.tensions) {
    parts.push(TENSION_COPY_ZH[t]);
  }

  parts.push(bridgeFromAxes(params.bands));

  const trailer = clip(params.labelFitSummary, 120);
  if (trailer) {
    parts.push(`画像摘要补充：${trailer}`);
  }

  return parts.filter(Boolean).join("\n\n");
}

function axesDtoFromBands(
  bands: InteractionLiteRawBands,
  conf: LiteConfidence,
): InteractionSimulationLiteAxesDto {
  return {
    pickupEase: {
      band: bands.pickup,
      oneLiner: oneLinerPickup(bands.pickup),
      confidence: conf,
    },
    coldFieldRisk: {
      band: bands.cold,
      oneLiner: oneLinerCold(bands.cold),
      confidence: conf,
    },
    misunderstandingRisk: {
      band: bands.mis,
      oneLiner: oneLinerMisread(bands.mis),
      confidence: conf,
    },
    continuationSignal: {
      band: bands.cont,
      oneLiner: oneLinerContinuation(bands.cont),
      confidence: conf,
    },
  };
}

/**
 * P6.y 规则层 v2：raw → coherence → verdict → summary（模型 fallback 同路径）。
 */
export function buildInteractionSimulationLiteRulePayload(params: {
  reviewStaticScore: number;
  staticSummary: MatchReviewStaticSummaryPayload;
}): {
  axes: InteractionSimulationLiteAxesDto;
  overall: InteractionSimulationLiteOverallDto;
} {
  const S = params.reviewStaticScore;
  const F = params.staticSummary.majorFits.length;
  const R = params.staticSummary.majorRisks.length;

  const rawAxes = computeRawBandsV1(F, R, S);
  const { bands, tensions } = applyCoherencePass(rawAxes);
  const verdict = verdictFromAxes(bands);
  const conf = confidenceFromFrs(F, R, S);
  const summary = composeSummaryV2({
    verdict,
    tensions,
    bands,
    labelFitSummary: params.staticSummary.labelFitSummary,
  });

  return {
    axes: axesDtoFromBands(bands, conf),
    overall: {
      verdict,
      summary,
      confidence: conf,
    },
  };
}
