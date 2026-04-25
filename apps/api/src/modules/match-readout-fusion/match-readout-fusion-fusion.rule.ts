import type { AiMatchReview } from "../match-review-ai/match-review-ai.types";
import type { LiteOverallVerdict } from "../interaction-simulation-lite/interaction-simulation-lite.types";
import { MATCH_READOUT_FUSION_RULE_VERSION } from "./match-readout-fusion.constants";
import type {
  MatchReadoutFusionDebugDto,
  MatchReadoutFusionInputsDto,
  MatchReadoutFusionResponseDto,
  ReadoutStance,
} from "./match-readout-fusion.types";

/** 与 Final Match 展示一致：0–1 视为比例，换算为百分制。 */
export function normalizeWorkerFinalScorePercent(
  finalScore: number | null | undefined,
): number | null {
  if (finalScore == null || Number.isNaN(Number(finalScore))) return null;
  const n = Number(finalScore);
  if (n >= 0 && n <= 1) return n * 100;
  return n;
}

export function workerStanceFromPercent(p: number | null): ReadoutStance {
  if (p == null) return "mid";
  if (p >= 62) return "up";
  if (p >= 40) return "mid";
  return "down";
}

export function p6xStanceFromRecommendation(
  r: AiMatchReview["recommendation"],
): ReadoutStance {
  if (r === "strong_match" || r === "match") return "up";
  if (r === "cautious_match") return "mid";
  return "down";
}

export function p6yStanceFromVerdict(v: LiteOverallVerdict): ReadoutStance {
  if (v === "worth_exploring") return "up";
  if (v === "cautious") return "mid";
  return "down";
}

function aggregateStance(w: ReadoutStance, x: ReadoutStance, y: ReadoutStance): ReadoutStance {
  const anyDown = w === "down" || x === "down" || y === "down";
  const allDown = w === "down" && x === "down" && y === "down";
  if (allDown) return "down";
  if (anyDown) return "down";
  if (w === "up" && x === "up" && y === "up") return "up";
  if (w === "mid" && x === "mid" && y === "mid") return "mid";
  return "mid";
}

function tensionCase(
  w: ReadoutStance,
  x: ReadoutStance,
  y: ReadoutStance,
): "A" | "B" | "C" | null {
  if (w === "up" && (x === "down" || y === "down")) return "A";
  if (w === "down" && (x === "up" || y === "up")) return "B";
  if ((w === "mid" || w === "up") && x === "down" && y === "down") return "C";
  return null;
}

function tensionZhFromCase(
  t: "A" | "B" | "C",
): string {
  if (t === "A") {
    return "本轮系统匹配度偏乐观，但问卷复审或首轮互动预判更谨慎，因此会出现「排序靠前、相处需放慢」的观感。";
  }
  if (t === "B") {
    return "系统排序偏保守，而问卷复审或首轮互动信号相对更积极，读数上会形成一定反差。";
  }
  return "系统侧偏乐观，问卷复审与首轮互动预判同时偏保守，需要在相处预期上多留余地。";
}

function headlineForAggregate(a: ReadoutStance): string {
  if (a === "up") {
    return "总读数：整体信号偏积极，可以带着好奇小步了解对方，但仍以线下真实相处为准。";
  }
  if (a === "down") {
    return "总读数：综合信号偏保守，建议先把节奏放慢，用轻度互动验证舒适度再决定是否加深。";
  }
  return "总读数：信号整体中性，适合先轻松接触、观察互动是否越来越顺，再判断是否值得投入更多。";
}

function bulletsFor(
  aggregate: ReadoutStance,
  tension: "A" | "B" | "C" | null,
): string[] {
  const out: string[] = [];

  if (aggregate === "down") {
    out.push("行动上：首轮话题宜短、宜具体，避免一次把期待聊满。");
  } else if (aggregate === "up") {
    out.push("行动上：可从日常与兴趣交叉点破冰，分几次聊天感受节奏，不必急于定性。");
  } else {
    out.push("行动上：保持轻松提问与反馈，看对方回应是否稳定、话题是否自然延续。");
  }

  if (tension) {
    out.push(
      "注意点：若系统分与问卷/首轮预判不一致，请更重视问卷与首轮互动信号；系统分代表本轮排序，不等于现场相处结果。",
    );
  } else if (aggregate === "mid") {
    out.push("注意点：下方「了解这次匹配」与复审区可按需展开，补充细节即可，不必一次读完。");
  } else {
    out.push("注意点：若后续实际聊天感受与读数差异大，以你的真实体验为准，读数仅作出发参考。");
  }

  if (out.length < 2) {
    out.push("注意点：建议结合下方区块分步阅读，避免信息过载。");
  }

  return out.slice(0, 3);
}

export function computeReadoutFusion(params: {
  matchResultId: string;
  workerFinalScore: number | null | undefined;
  p6xRecommendation: AiMatchReview["recommendation"];
  p6yVerdict: LiteOverallVerdict;
}): MatchReadoutFusionResponseDto {
  const workerPct = normalizeWorkerFinalScorePercent(params.workerFinalScore);
  const workerStance = workerStanceFromPercent(workerPct);
  const p6xStance = p6xStanceFromRecommendation(params.p6xRecommendation);
  const p6yStance = p6yStanceFromVerdict(params.p6yVerdict);

  const aggregate = aggregateStance(workerStance, p6xStance, p6yStance);
  const t = tensionCase(workerStance, p6xStance, p6yStance);
  const tensionZh = t ? tensionZhFromCase(t) : "";

  const parts: string[] = [];
  if (
    workerStance === p6xStance &&
    p6xStance === p6yStance
  ) {
    parts.push(`consensus_${workerStance}`);
  } else {
    const hasAnyDown =
      workerStance === "down" || p6xStance === "down" || p6yStance === "down";
    const allDown =
      workerStance === "down" && p6xStance === "down" && p6yStance === "down";
    if (hasAnyDown && !allDown) parts.push("min_down_wins");
    else if (
      !hasAnyDown &&
      (workerStance !== p6xStance || p6xStance !== p6yStance)
    ) {
      parts.push("mixed_mid");
    } else {
      parts.push(`consensus_${aggregate}`);
    }
  }
  if (t) parts.push(`tension_${t}`);
  const ruleTrace = parts.join("+");

  const inputs: MatchReadoutFusionInputsDto = {
    workerScorePercent: workerPct,
    workerStance,
    p6xRecommendation: params.p6xRecommendation,
    p6xStance,
    p6yVerdict: params.p6yVerdict,
    p6yStance,
  };

  const debug: MatchReadoutFusionDebugDto = {
    fusionVersion: MATCH_READOUT_FUSION_RULE_VERSION,
    inputs,
    ruleTrace,
  };

  return {
    matchResultId: params.matchResultId,
    headlineZh: headlineForAggregate(aggregate),
    bulletsZh: bulletsFor(aggregate, t),
    tensionZh,
    debug,
  };
}
