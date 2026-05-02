import type { AiSimulationLlmPayloadV2, RrmScenarioResultV2 } from "./ai-simulation-v1.types";
import {
  AI_SIMULATION_RRM_SOURCE_VERSION,
  RRM_NEXT_STEP_SUITABILITY,
  RRM_SCENARIO_APPROACH_INTENSITY,
  RRM_SCENARIO_KEYS_ORDERED,
} from "./ai-simulation-v1-rrm.constants";
import {
  RRM_SIM_F_SIM_CAP,
  RRM_SIM_LOW_MEAN_Q_SOFT_PROGRESS_CAP,
  RRM_SIM_PROGRESSION_SCORE_OPEN_MIN,
  RRM_SIM_PROGRESSION_SCORE_STRONG_OPEN_MIN,
  RRM_SIM_PROGRESSION_SCORE_WEAK_OPEN_MIN,
  RRM_SIM_RESPECT_R_PRE_GATE,
  RRM_SIM_SCENARIO_WEIGHTS,
  RRM_SIM_SOURCE_SIMULATION_VERSION,
  RRM_SIM_SOURCE_VERSION,
  RRM_SIM_STATIC_D_PRE_CLOSED_WINDOW,
  RRM_SIM_STATIC_D_PRE_GATE,
  RRM_SIM_UNAVAILABLE_EVAL_FAILED,
  RRM_SIM_UNAVAILABLE_NOT_FULL,
  type RrmSimLevelBand,
  type RrmSimProgressionWindow,
  type RrmSimSuggestedAction,
} from "./rrm-sim.constants";
import type { RrmSimEvidenceBlock, RrmSimResult, RrmSimScenarioScoreRow } from "./rrm-sim.types";
import { aggregateRfiSim, clamp, clamp01, computeRfiScenario, rfiToSimulatedRhythmScore } from "./rrm-sim-formula";
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

function scoreToLevel(x: number): RrmSimLevelBand {
  if (x <= 0.35) return "low";
  if (x <= 0.55) return "medium";
  if (x <= 0.72) return "medium_high";
  return "high";
}

/** M1.2 — progression from rhythm score only (RFI → score unchanged). */
function progressionWindowFromSimulatedRhythmScore(score: number): RrmSimProgressionWindow {
  if (score < RRM_SIM_PROGRESSION_SCORE_WEAK_OPEN_MIN) return "closed";
  if (score < RRM_SIM_PROGRESSION_SCORE_OPEN_MIN) return "weak_open";
  if (score < RRM_SIM_PROGRESSION_SCORE_STRONG_OPEN_MIN) return "open";
  return "strong_open";
}

/**
 * M1.2 — suggested action from rhythm score + respect pre (R_pre >= gate handled earlier).
 * No manipulative / high-pressure wording; caps at soft_progress at most.
 */
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

function buildEvidence(
  payload: AiSimulationLlmPayloadV2,
  staticContext: Record<string, unknown> | null,
  R: number,
): RrmSimEvidenceBlock {
  const pick = (arr: string[], n: number) => arr.slice(0, n);
  const cSnips: string[] = [];
  if (staticContext?.reviewStaticScore != null) {
    cSnips.push(`静态兼容参考分约 ${String(staticContext.reviewStaticScore)}`);
  }
  cSnips.push(
    `七场景均分约 ${(payload.scenarioResults.reduce((a, r) => a + r.evaluator.scenarioScore, 0) / 7).toFixed(2)}`,
  );
  const sSnips = payload.scenarioResults.map(
    (r, i) => `场景${i + 1}话题顺滑：${String(r.signals.topicContinuity).slice(0, 40)}…`,
  );
  const eSnips = payload.scenarioResults.map(
    (r, i) => `场景${i + 1}安全感：${String(r.signals.emotionalSafety).slice(0, 40)}…`,
  );
  const qSnips = payload.scenarioResults.map(
    (r, i) => `场景${i + 1}互动质量线索：${String(r.signals.mutualInvestment).slice(0, 36)}…`,
  );
  const fSnips = [
    `整体一致性摘要：${payload.overallSimulationAssessment.crossScenarioConsistency.slice(0, 60)}…`,
    `F_sim 上限按契约封顶为 ${RRM_SIM_F_SIM_CAP}（同一次 completion）。`,
  ];
  const dSnips = pick(
    payload.overallSimulationAssessment.mainRisks.map((x) => `风险线索：${x}`),
    3,
  );
  const rSnips: string[] = [];
  if (R > 0.45) rSnips.push("检测到偏强边界/尊重类措辞风险信号，已上调 R。");
  else rSnips.push("未发现强烈强迫/威胁类话术模式。");
  return {
    C_pred: pick(cSnips, 3),
    S_sim: pick(sSnips, 3),
    E_sim: pick(eSnips, 3),
    F_sim: fSnips,
    Q_sim: pick(qSnips, 3),
    D_pre: pick(dSnips, 3),
    R_pre: rSnips,
  };
}

export function isFullRrmSimEvaluatorInput(x: unknown): x is AiSimulationLlmPayloadV2 {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.schemaVersion !== 2) return false;
  if (o.sourceVersion !== AI_SIMULATION_RRM_SOURCE_VERSION) return false;
  const sr = o.scenarioResults;
  if (!Array.isArray(sr) || sr.length !== RRM_SCENARIO_KEYS_ORDERED.length) return false;
  for (let i = 0; i < RRM_SCENARIO_KEYS_ORDERED.length; i += 1) {
    const row = sr[i];
    if (row == null || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    const key = RRM_SCENARIO_KEYS_ORDERED[i];
    if (r.scenario !== key) return false;
    const ev = r.evaluator;
    if (typeof ev !== "object" || ev === null) return false;
    const evo = ev as Record<string, unknown>;
    if (typeof evo.scenarioScore !== "number" || typeof evo.confidence !== "number") return false;
    const inten = r.scenarioApproachIntensity;
    if (typeof inten !== "number" || !Number.isFinite(inten)) return false;
    const expected = RRM_SCENARIO_APPROACH_INTENSITY[key];
    if (Math.abs(inten - expected) > 0.021) return false;
  }
  const ov = o.overallSimulationAssessment;
  if (ov == null || typeof ov !== "object") return false;
  const ova = ov as Record<string, unknown>;
  if (!Array.isArray(ova.mainStrengths) || !Array.isArray(ova.mainRisks)) return false;
  if (typeof ova.crossScenarioConsistency !== "string" || typeof ova.confidence !== "number") return false;
  return true;
}

function emptyScores(): RrmSimResult["scores"] {
  return {
    C_pred: 0,
    F_sim: 0,
    D_pre: 0,
    R_pre: 0,
    RFI_sim: 0,
    simulatedRhythmScore: 0,
  };
}

function emptyLevels(): RrmSimResult["levels"] {
  return {
    relationshipCapacity: "low",
    contextualFit: "low",
    emotionalSafety: "low",
    feedbackReliability: "low",
    interactionQuality: "low",
    riskLevel: "high",
  };
}

function emptyEvidence(): RrmSimEvidenceBlock {
  return { C_pred: [], S_sim: [], E_sim: [], F_sim: [], Q_sim: [], D_pre: [], R_pre: [] };
}

export function buildFallbackRrmSimResult(
  reason: typeof RRM_SIM_UNAVAILABLE_NOT_FULL | typeof RRM_SIM_UNAVAILABLE_EVAL_FAILED,
  summaryOverride?: string,
): RrmSimResult {
  return {
    schemaVersion: 1,
    sourceVersion: RRM_SIM_SOURCE_VERSION,
    sourceSimulationVersion: RRM_SIM_SOURCE_SIMULATION_VERSION,
    fallbackUsed: true,
    rrmUnavailableReason: reason,
    scores: emptyScores(),
    scenarioScores: [],
    levels: emptyLevels(),
    progressionWindow: "closed",
    suggestedAction: "maintain",
    summary:
      summaryOverride ??
      "当前模拟结果不是完整 RRM-ready 七场景版本，暂不生成完整关系节奏预测。",
    evidence: emptyEvidence(),
  };
}

/**
 * Deterministic RRM-Sim layer (M1-Full). Pure given inputs; no extra LLM.
 * `staticContext` optional — C_pred / D_pre use transcript-heavy heuristics when absent.
 */
export function evaluateRrmSimFromSimulationV2(
  transcriptLite: unknown,
  staticContext?: Record<string, unknown> | null,
): RrmSimResult {
  try {
    if (!isFullRrmSimEvaluatorInput(transcriptLite)) {
      return buildFallbackRrmSimResult(RRM_SIM_UNAVAILABLE_NOT_FULL);
    }
    const payload = transcriptLite;
    const ctx = staticContext ?? null;

    const C_pred = extractCPred(payload, ctx);
    const F_sim = extractFGlobal(payload);
    const D_pre = extractDPre(payload, ctx);
    const R_pre = extractRPre(payload, ctx);

    const weights = RRM_SCENARIO_KEYS_ORDERED.map((k) => RRM_SIM_SCENARIO_WEIGHTS[k]);
    const scenarioScores: RrmSimScenarioScoreRow[] = [];
    const rfis: number[] = [];

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
    }

    let RFI_sim = aggregateRfiSim(rfis, weights);
    RFI_sim = clamp(RFI_sim, -1, 1);
    let simulatedRhythmScore = rfiToSimulatedRhythmScore(RFI_sim);
    simulatedRhythmScore = clamp(simulatedRhythmScore, 0, 100);

    const meanS = scenarioScores.reduce((a, r) => a + r.S_sim, 0) / 7;
    const meanE = scenarioScores.reduce((a, r) => a + r.E_sim, 0) / 7;
    const meanQ = scenarioScores.reduce((a, r) => a + r.Q_sim, 0) / 7;

    let progressionWindow: RrmSimProgressionWindow;
    let suggestedAction: RrmSimSuggestedAction;

    if (R_pre >= RRM_SIM_RESPECT_R_PRE_GATE) {
      suggestedAction = "stop_or_step_back";
      progressionWindow = "closed";
      simulatedRhythmScore = Math.min(simulatedRhythmScore, 25);
    } else if (D_pre >= RRM_SIM_STATIC_D_PRE_GATE) {
      suggestedAction = "slow_down";
      progressionWindow =
        D_pre >= RRM_SIM_STATIC_D_PRE_CLOSED_WINDOW ? "closed" : "weak_open";
    } else {
      progressionWindow = progressionWindowFromSimulatedRhythmScore(simulatedRhythmScore);
      suggestedAction = capSuggestedForLowMeanQ(meanQ, suggestedActionFromSimulatedRhythmScore(simulatedRhythmScore));
    }

    const levels: RrmSimResult["levels"] = {
      relationshipCapacity: scoreToLevel(C_pred),
      contextualFit: scoreToLevel(meanS),
      emotionalSafety: scoreToLevel(meanE),
      feedbackReliability: scoreToLevel(F_sim),
      interactionQuality: scoreToLevel(meanQ),
      riskLevel: scoreToLevel(R_pre),
    };

    const summary =
      R_pre >= RRM_SIM_RESPECT_R_PRE_GATE
        ? "检测到较高的尊重与边界风险信号：不建议继续推进，建议明显后撤并保持安全距离。"
        : D_pre >= RRM_SIM_STATIC_D_PRE_GATE
          ? "静态兼容维度显示关系目标或节奏分歧偏高：不建议加快推进，建议放慢并优先对齐预期与边界。"
          : `关系节奏预测分数约 ${simulatedRhythmScore}（百分制）。整体互动质量与上下文顺滑度用于内部节奏参考，不构成匹配结论。`;

    return {
      schemaVersion: 1,
      sourceVersion: RRM_SIM_SOURCE_VERSION,
      sourceSimulationVersion: RRM_SIM_SOURCE_SIMULATION_VERSION,
      fallbackUsed: false,
      rrmUnavailableReason: null,
      scores: {
        C_pred,
        F_sim,
        D_pre,
        R_pre,
        RFI_sim,
        simulatedRhythmScore,
      },
      scenarioScores,
      levels,
      progressionWindow,
      suggestedAction,
      summary,
      evidence: buildEvidence(payload, ctx, R_pre),
    };
  } catch {
    return buildFallbackRrmSimResult(
      RRM_SIM_UNAVAILABLE_EVAL_FAILED,
      "关系节奏预测暂时不可用（内部计算异常），不影响匹配结论。",
    );
  }
}
