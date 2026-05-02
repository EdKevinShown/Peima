import type { AiSimulationLlmPayloadV2, RrmScenarioResultV2 } from "./ai-simulation-v1.types";
import { clamp01 } from "./rrm-sim-formula";
import { applyFsimCap } from "./rrm-sim-formula";

const COERCION_RE =
  /强迫|威胁|羞辱|骚扰|道德绑架|必须马上|为什么不回|已读不回|别想躲|不给拒绝|不尊重拒绝|不给空间|控制欲|绑架|逼问|羞辱性|持续施压|明确拒绝后|不许拒绝|别想跑/gi;

const AWKWARD_RE = /断裂|突兀|冷场|接不上|话题断|尴尬沉默|各说各话/gi;

const POSITIVE_FLOW_RE = /自然|顺畅|承接|延展|连贯|轻松|温和|留白|尊重/gi;

const LOW_PRESSURE_RE = /低压力|尊重边界|可拒绝|不催促|留白|温和|空间|慢慢来/gi;

function joinTranscript(msgs: { message: string }[]): string {
  return msgs.map((m) => m.message).join("\n");
}

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

/** Global respect / coercion risk in [0,1]. */
export function extractRPre(payload: AiSimulationLlmPayloadV2, staticContext: Record<string, unknown> | null): number {
  let hits = 0;
  const mainRisks = payload.overallSimulationAssessment.mainRisks;
  const blob = [
    joinTranscript(payload.scenarioResults.flatMap((r) => r.simulationTranscript)),
    ...payload.scenarioResults.map((r) => r.signals.pressureOrBoundaryRisk),
    ...mainRisks,
  ].join("\n");
  hits += countMatches(blob, COERCION_RE);
  if (staticContext) {
    const risks = staticContext.majorRisks;
    if (Array.isArray(risks)) {
      hits += countMatches(risks.filter((x): x is string => typeof x === "string").join("\n"), COERCION_RE);
    }
  }
  return clamp01(0.18 * Math.min(6, hits) + 0.08 * (hits > 0 ? 1 : 0));
}

/** Per-scenario respect risk [0,1]. */
export function extractRScenario(row: RrmScenarioResultV2): number {
  const t = joinTranscript(row.simulationTranscript) + row.signals.pressureOrBoundaryRisk;
  const h = countMatches(t, COERCION_RE);
  return clamp01(0.22 * Math.min(5, h));
}

export function extractSPerScenario(row: RrmScenarioResultV2): number {
  const score = clamp01(row.evaluator.scenarioScore);
  const sig = `${row.signals.topicContinuity} ${row.signals.conversationMomentum} ${row.simulationSummary}`;
  const pos = countMatches(sig, POSITIVE_FLOW_RE);
  const awk = countMatches(joinTranscript(row.simulationTranscript) + sig, AWKWARD_RE);
  return clamp01(0.45 * score + 0.06 * Math.min(4, pos) - 0.1 * Math.min(3, awk));
}

export function extractEPerScenario(row: RrmScenarioResultV2): number {
  const sig = `${row.signals.emotionalSafety} ${row.signals.pressureOrBoundaryRisk}`;
  const pos = countMatches(sig, LOW_PRESSURE_RE);
  const neg = countMatches(joinTranscript(row.simulationTranscript) + sig, COERCION_RE);
  return clamp01(0.55 + 0.05 * Math.min(4, pos) - 0.18 * Math.min(4, neg));
}

export function extractQPerScenario(row: RrmScenarioResultV2): number {
  const score = clamp01(row.evaluator.scenarioScore);
  const sig = `${row.signals.mutualInvestment} ${row.signals.conversationMomentum} ${row.simulationSummary}`;
  const pos = countMatches(sig, /双向|共鸣|投入|理解|轻松|自然/g);
  return clamp01(0.42 * score + 0.07 * Math.min(5, pos));
}

export function extractFGlobal(payload: AiSimulationLlmPayloadV2): number {
  const rows = payload.scenarioResults;
  const scores = rows.map((r) => r.evaluator.scenarioScore);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const v =
    scores.reduce((a, s) => a + (s - mean) * (s - mean), 0) / Math.max(1, scores.length);
  const std = Math.sqrt(v);
  const spread = mean > 1e-6 ? Math.min(1, std / mean) : 0;
  const confMean = rows.reduce((a, r) => a + r.evaluator.confidence, 0) / rows.length;
  const cross = payload.overallSimulationAssessment.crossScenarioConsistency;
  const consistentBoost = /一致|稳定|相近|协调|同向/i.test(cross) ? 0.08 : 0;
  const raw = 0.28 + 0.32 * clamp01(confMean) + 0.28 * (1 - spread) + consistentBoost;
  return applyFsimCap(raw);
}

const STATIC_RISK_D_BOOST_RE =
  /婚姻|生育|节奏|冲突|风险|目标|对齐|差异|控制|压力|安全|价值观|婚育|长期|现实/gi;

export function extractDPre(payload: AiSimulationLlmPayloadV2, staticContext: Record<string, unknown> | null): number {
  let d = 0.22;
  const mainRisks = payload.overallSimulationAssessment.mainRisks.join("\n");
  d += 0.04 * Math.min(8, mainRisks.length / 8);
  d += 0.06 * countMatches(mainRisks, /冲突|节奏|安全|目标|压力|控制/g);
  if (staticContext) {
    const risks = staticContext.majorRisks;
    if (Array.isArray(risks)) {
      const riskLines = risks.filter((x): x is string => typeof x === "string");
      const n = riskLines.length;
      d += 0.055 * Math.min(5, n);
      const riskText = riskLines.join("\n");
      d += 0.05 * Math.min(6, countMatches(riskText, STATIC_RISK_D_BOOST_RE));
    }
    const hint = staticContext.relationshipGoalHint;
    if (typeof hint === "string" && /差异偏大|冲突|偏高/.test(hint)) d += 0.07;
  }
  return clamp01(d);
}

/**
 * Predicted relationship capacity C_pred in [0,1].
 * Uses staticContext when present; otherwise conservative transcript-only blend.
 */
export function extractCPred(payload: AiSimulationLlmPayloadV2, staticContext: Record<string, unknown> | null): number {
  const meanScenario = payload.scenarioResults.reduce((a, r) => a + r.evaluator.scenarioScore, 0) / 7;
  const mut = payload.scenarioResults.map((r) => r.signals.mutualInvestment).join(" ");
  const mutStab = /稳定|均衡|双向|自然/.test(mut) ? 0.06 : 0;

  if (!staticContext) {
    return clamp01(0.32 + 0.48 * meanScenario + mutStab);
  }

  const rss = staticContext.reviewStaticScore;
  const rs = typeof rss === "number" && Number.isFinite(rss) ? clamp01(rss / 100) : 0.5;
  const fits = Array.isArray(staticContext.majorFits) ? staticContext.majorFits.length : 0;
  const risks = Array.isArray(staticContext.majorRisks) ? staticContext.majorRisks.length : 0;
  const axes = staticContext.axes;
  let axisHarmony = 0.5;
  if (axes && typeof axes === "object" && !Array.isArray(axes)) {
    const vals = Object.values(axes as Record<string, { viewer: number | null; candidate: number | null }>);
    let sumGap = 0;
    let count = 0;
    for (const p of vals) {
      if (p && typeof p.viewer === "number" && typeof p.candidate === "number") {
        sumGap += Math.abs(p.viewer - p.candidate);
        count += 1;
      }
    }
    if (count > 0) axisHarmony = clamp01(1 - Math.min(1, sumGap / (count * 10)));
  }
  let c = 0.18 * rs + 0.1 * Math.min(1, fits / 5) - 0.1 * Math.min(1, risks / 5) + 0.28 * meanScenario + mutStab + 0.14 * axisHarmony;
  if (risks >= 4) c -= 0.05 * Math.min(1, (risks - 3) / 3);
  return clamp01(c);
}
