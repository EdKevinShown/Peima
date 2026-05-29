import { QUESTIONNAIRE_LABEL_MATCH_V3 } from "./questionnaire-personality-labels.constants";
import {
  bestCoreLabelWeakMatchRatio,
  matchPersonalityLabelsV3,
} from "./questionnaire-personality-labels";
import {
  buildRandomCanonicalAnswers,
  buildOverallExplanationFromAnswers,
} from "./questionnaire-overall-explanation-convergence-audit";
import { buildAxisBranchProfilesV3 } from "./questionnaire.scorer";

export type NonConvergenceCauseReport = {
  sampled: number;
  /** 标题「尚未收敛到命名标签」 */
  fallbackCount: number;
  fallbackPercent: number;
  /** 有命名标签（primary 或 candidate） */
  namedLabelCount: number;
  namedLabelPercent: number;
  /** 至少一轴 uncertain */
  hasUncertainAxisCount: number;
  hasUncertainAxisPercent: number;
  /** 有命名标签 且 至少一轴 uncertain（常见：有名字但段落带不确定性） */
  namedButUncertainCount: number;
  namedButUncertainPercent: number;
  fallbackCauseBuckets: {
    nearMiss_60_to_75: number;
    partial_50_to_60: number;
    weak_below_50: number;
    highAxisAmbiguity_12plus: number;
    midAxisAmbiguity_6_to_11: number;
    lowAxisAmbiguity_0_to_5: number;
    sparseEvidence_5plus_empty_axes: number;
  };
  convergedUncertainAxisAvg: number;
  fallbackUncertainAxisAvg: number;
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function countAxesWithNoTagEvidence(
  layer1: ReturnType<typeof buildAxisBranchProfilesV3>,
): number {
  let n = 0;
  for (let axis = 1; axis <= 20; axis += 1) {
    const p = layer1[axis];
    if (!p) continue;
    const hasOpp = Object.values(p.branches).some((b) => b.opportunities > 0);
    if (!hasOpp) n += 1;
  }
  return n;
}

export function analyzeNonConvergenceCauses(opts: {
  randomSamples: number;
  randomSeed?: number;
}): NonConvergenceCauseReport {
  const rng = mulberry32(opts.randomSeed ?? 42);
  const minRatio = QUESTIONNAIRE_LABEL_MATCH_V3.CANDIDATE_MIN_MATCH_RATIO;

  let sampled = 0;
  let fallbackCount = 0;
  let hasUncertainAxisCount = 0;
  let namedButUncertainCount = 0;
  let convergedUncertainSum = 0;
  let fallbackUncertainSum = 0;

  const buckets = {
    nearMiss_60_to_75: 0,
    partial_50_to_60: 0,
    weak_below_50: 0,
    highAxisAmbiguity_12plus: 0,
    midAxisAmbiguity_6_to_11: 0,
    lowAxisAmbiguity_0_to_5: 0,
    sparseEvidence_5plus_empty_axes: 0,
  };

  for (let i = 0; i < opts.randomSamples; i += 1) {
    const answers = buildRandomCanonicalAnswers(rng);
    const layer1 = buildAxisBranchProfilesV3(answers);
    const labels = matchPersonalityLabelsV3(layer1);
    const built = buildOverallExplanationFromAnswers(answers);
    const isFallback = built.displayPrimarySource === "fallback";
    const uncertainN = built.uncertainAxisCount;
    const hasUncertain = uncertainN > 0;
    const bestWeak = bestCoreLabelWeakMatchRatio(layer1);
    const emptyAxes = countAxesWithNoTagEvidence(layer1);

    sampled += 1;
    if (isFallback) {
      fallbackCount += 1;
      fallbackUncertainSum += uncertainN;
      if (bestWeak >= 0.6 && bestWeak < minRatio) {
        buckets.nearMiss_60_to_75 += 1;
      } else if (bestWeak >= 0.5 && bestWeak < 0.6) {
        buckets.partial_50_to_60 += 1;
      } else {
        buckets.weak_below_50 += 1;
      }
      if (uncertainN >= 12) buckets.highAxisAmbiguity_12plus += 1;
      else if (uncertainN >= 6) buckets.midAxisAmbiguity_6_to_11 += 1;
      else buckets.lowAxisAmbiguity_0_to_5 += 1;
      if (emptyAxes >= 5) buckets.sparseEvidence_5plus_empty_axes += 1;
    } else {
      convergedUncertainSum += uncertainN;
      if (hasUncertain) namedButUncertainCount += 1;
    }
    if (hasUncertain) hasUncertainAxisCount += 1;
  }

  const namedLabelCount = sampled - fallbackCount;
  return {
    sampled,
    fallbackCount,
    fallbackPercent: (fallbackCount / sampled) * 100,
    namedLabelCount,
    namedLabelPercent: (namedLabelCount / sampled) * 100,
    hasUncertainAxisCount,
    hasUncertainAxisPercent: (hasUncertainAxisCount / sampled) * 100,
    namedButUncertainCount,
    namedButUncertainPercent:
      namedLabelCount > 0
        ? (namedButUncertainCount / namedLabelCount) * 100
        : 0,
    fallbackCauseBuckets: buckets,
    convergedUncertainAxisAvg:
      namedLabelCount > 0 ? convergedUncertainSum / namedLabelCount : 0,
    fallbackUncertainAxisAvg:
      fallbackCount > 0 ? fallbackUncertainSum / fallbackCount : 0,
  };
}

export function formatNonConvergenceCauseReport(
  r: NonConvergenceCauseReport,
): string {
  const b = r.fallbackCauseBuckets;
  const fb = r.fallbackCount || 1;
  return [
    `sampled=${r.sampled}`,
    "",
    "【产品层「未收敛」= fallback 标题】",
    `fallback=${r.fallbackCount} (${r.fallbackPercent.toFixed(2)}%)`,
    `named_label=${r.namedLabelCount} (${r.namedLabelPercent.toFixed(2)}%)`,
    "",
    "【轴级不确定（≠ 一定显示未收敛标题）】",
    `has_uncertain_axis=${r.hasUncertainAxisCount} (${r.hasUncertainAxisPercent.toFixed(2)}%)`,
    `named_but_uncertain=${r.namedButUncertainCount} (${r.namedButUncertainPercent.toFixed(2)}% among named_label only)`,
    `avg_uncertain_axes: converged=${r.convergedUncertainAxisAvg.toFixed(2)} fallback=${r.fallbackUncertainAxisAvg.toFixed(2)}`,
    "",
    "【fallback 子因（占 fallback 样本）】",
    `near_miss_60-75%=${b.nearMiss_60_to_75} (${((b.nearMiss_60_to_75 / fb) * 100).toFixed(1)}%) — 规则接近命中，阈值下正常边缘`,
    `partial_50-60%=${b.partial_50_to_60} (${((b.partial_50_to_60 / fb) * 100).toFixed(1)}%) — 部分吻合`,
    `weak_<50%=${b.weak_below_50} (${((b.weak_below_50 / fb) * 100).toFixed(1)}%) — 与所有命名人格较远`,
    `axis_ambiguity_high_12+=${b.highAxisAmbiguity_12plus} (${((b.highAxisAmbiguity_12plus / fb) * 100).toFixed(1)}%) — 多轴并列/信号分散`,
    `axis_ambiguity_mid_6-11=${b.midAxisAmbiguity_6_to_11} (${((b.midAxisAmbiguity_6_to_11 / fb) * 100).toFixed(1)}%)`,
    `axis_ambiguity_low_0-5=${b.lowAxisAmbiguity_0_to_5} (${((b.lowAxisAmbiguity_0_to_5 / fb) * 100).toFixed(1)}%) — 轴较清晰仍无标签`,
    `sparse_evidence_5+_empty_axes=${b.sparseEvidence_5plus_empty_axes} (${((b.sparseEvidence_5plus_empty_axes / fb) * 100).toFixed(1)}%)`,
  ].join("\n");
}
