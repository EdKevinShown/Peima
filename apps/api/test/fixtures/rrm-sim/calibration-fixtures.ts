/**
 * M1.1 — RRM-Sim calibration payloads (7-scenario v2 + optional staticContext).
 * Deterministic; used only in tests.
 */
import {
  AI_SIMULATION_RRM_SOURCE_VERSION,
  AI_SIMULATION_RRM_SOURCE_VERSION_LEGACY_V1,
  RRM_SCENARIO_APPROACH_INTENSITY,
  RRM_SCENARIO_KEYS_ORDERED,
} from "../../../src/modules/ai-simulation-v1/ai-simulation-v1-rrm.constants";
import type { AiSimulationLlmPayloadV2, RrmScenarioResultV2 } from "../../../src/modules/ai-simulation-v1/ai-simulation-v1.types";

function eightMsgs(prefix: string, body: (i: number) => string) {
  const lines: RrmScenarioResultV2["simulationTranscript"] = [];
  for (let i = 0; i < 8; i += 1) {
    const speaker = i % 2 === 0 ? ("viewer" as const) : ("candidate" as const);
    lines.push({ speaker, message: body(i).slice(0, 160) });
  }
  return lines;
}

function baseOverall(partial: Partial<AiSimulationLlmPayloadV2["overallSimulationAssessment"]>) {
  return {
    crossScenarioConsistency: partial.crossScenarioConsistency ?? "语气一致、低压力。",
    mainStrengths: partial.mainStrengths ?? ["自然接话"],
    mainRisks: partial.mainRisks ?? ["信息仍浅"],
    recommendedOpeningStyle: partial.recommendedOpeningStyle ?? "从近况切入。",
    confidence: partial.confidence ?? 0.72,
  };
}

function buildRow(
  key: (typeof RRM_SCENARIO_KEYS_ORDERED)[number],
  idx: number,
  opts: {
    scenarioScore: number;
    confidence?: number;
    transcript: (i: number) => string;
    signals: RrmScenarioResultV2["signals"];
    summary?: string;
  },
): RrmScenarioResultV2 {
  return {
    scenario: key,
    scenarioApproachIntensity: RRM_SCENARIO_APPROACH_INTENSITY[key],
    simulationTranscript: eightMsgs(`${key}-${idx}`, opts.transcript),
    simulationSummary: opts.summary ?? `围绕「${key}」的摘要。`,
    signals: opts.signals,
    evaluator: {
      scenarioScore: opts.scenarioScore,
      confidence: opts.confidence ?? 0.82,
    },
  };
}

/** 1) 高质量：自然、安全、双向投入、低风险。 */
export function calibrationHighQualityContinueLightly(): AiSimulationLlmPayloadV2 {
  const signals: RrmScenarioResultV2["signals"] = {
    topicContinuity: "自然顺畅承接延展连贯",
    emotionalSafety: "尊重边界低压力留白温和",
    mutualInvestment: "双向投入稳定均衡自然",
    pressureOrBoundaryRisk: "低压力可拒绝不催促",
    nextStepSuitability: "continue_lightly",
    conversationMomentum: "可自然延展轻松",
    repairPotential: "易圆场",
  };
  const rows = RRM_SCENARIO_KEYS_ORDERED.map((k, i) =>
    buildRow(k, i, {
      scenarioScore: 0.88,
      transcript: (j) => `${k}轮${j}：自然接话，轻松延展，互相尊重。`,
      signals: { ...signals, nextStepSuitability: i < 4 ? "continue_lightly" : "soft_progress" },
    }),
  );
  return {
    schemaVersion: 2,
    sourceType: "test",
    sourceVersion: AI_SIMULATION_RRM_SOURCE_VERSION,
    fallbackUsed: false,
    participants: { viewerUserId: "v1", candidateUserId: "c1" },
    scenarioResults: rows,
    overallSimulationAssessment: baseOverall({
      crossScenarioConsistency: "七场景一致稳定，同向协调。",
      mainStrengths: ["自然", "尊重", "双向"],
      mainRisks: ["仍偏浅"],
      confidence: 0.84,
    }),
  };
}

export function staticContextHighQuality() {
  return {
    reviewStaticScore: 86,
    majorFits: ["沟通节奏合拍", "安全感需求接近", "冲突处理风格互补", "生活节奏可对齐"],
    majorRisks: ["线下验证仍不足"],
    axes: {
      lifePace: { viewer: 6, candidate: 6 },
      communicationStyle: { viewer: 7, candidate: 7 },
    },
  };
}

/** 2) 礼貌安全但动量弱：E 中高、Q 与动量弱。 */
export function calibrationSafeButLowMomentum(): AiSimulationLlmPayloadV2 {
  const signals: RrmScenarioResultV2["signals"] = {
    topicContinuity: "礼貌寒暄承接尚可",
    emotionalSafety: "尊重边界低压力留白温和",
    mutualInvestment: "单向问好礼貌浅层缺乏牵涉",
    pressureOrBoundaryRisk: "低压力可拒绝",
    nextStepSuitability: "maintain",
    conversationMomentum: "平淡推进慢弱",
    repairPotential: "一般",
  };
  const rows = RRM_SCENARIO_KEYS_ORDERED.map((k, i) =>
    buildRow(k, i, {
      scenarioScore: 0.7,
      confidence: 0.74,
      transcript: (j) => `${k}轮${j}：客气问候，话题停留表面。`,
      signals: {
        ...signals,
        nextStepSuitability: i < 5 ? "maintain" : "continue_lightly",
      },
    }),
  );
  return {
    schemaVersion: 2,
    sourceType: "test",
    sourceVersion: AI_SIMULATION_RRM_SOURCE_VERSION,
    fallbackUsed: false,
    participants: { viewerUserId: "v1", candidateUserId: "c1" },
    scenarioResults: rows,
    overallSimulationAssessment: baseOverall({
      crossScenarioConsistency: "整体礼貌但偏浅。",
      mainStrengths: ["礼貌"],
      mainRisks: ["动量不足", "共鸣弱"],
      confidence: 0.68,
    }),
  };
}

/** 3) 尴尬上下文：话题断裂感，无强迫。 */
export function calibrationAwkwardContextLowS(): AiSimulationLlmPayloadV2 {
  const signals: RrmScenarioResultV2["signals"] = {
    topicContinuity: "话题断裂突兀接不上",
    emotionalSafety: "尚可无压迫",
    mutualInvestment: "浅层",
    pressureOrBoundaryRisk: "压力不高",
    nextStepSuitability: "slow_down",
    conversationMomentum: "冷场尴尬沉默各说各话",
    repairPotential: "弱",
  };
  const rows = RRM_SCENARIO_KEYS_ORDERED.map((k, i) =>
    buildRow(k, i, {
      scenarioScore: 0.58,
      transcript: (j) =>
        `${k}轮${j}：话题突兀跳转，冷场接不上，各说各话。`,
      signals,
      summary: "断裂感明显，缺乏自然延展。",
    }),
  );
  return {
    schemaVersion: 2,
    sourceType: "test",
    sourceVersion: AI_SIMULATION_RRM_SOURCE_VERSION,
    fallbackUsed: false,
    participants: { viewerUserId: "v1", candidateUserId: "c1" },
    scenarioResults: rows,
    overallSimulationAssessment: baseOverall({
      crossScenarioConsistency: "场景间跳跃感强。",
      mainStrengths: [],
      mainRisks: ["话题衔接弱"],
      confidence: 0.62,
    }),
  };
}

/** 4) 边界/压迫风险：触发 R_pre 闸门。 */
export function calibrationPressureBoundaryRisk(): AiSimulationLlmPayloadV2 {
  const riskSig: RrmScenarioResultV2["signals"] = {
    topicContinuity: "追问紧逼",
    emotionalSafety: "压迫感",
    mutualInvestment: "单向施压",
    pressureOrBoundaryRisk: "道德绑架必须马上回应为什么不回已读不回",
    nextStepSuitability: "stop_or_step_back",
    conversationMomentum: "强推",
    repairPotential: "低",
  };
  const rows = RRM_SCENARIO_KEYS_ORDERED.map((k, i) =>
    buildRow(k, i, {
      scenarioScore: 0.55,
      transcript: (j) =>
        `${k}轮${j}：逼问对方，道德绑架，必须马上回应，不尊重拒绝。`,
      signals: riskSig,
      summary: "持续施压与逼问。",
    }),
  );
  return {
    schemaVersion: 2,
    sourceType: "test",
    sourceVersion: AI_SIMULATION_RRM_SOURCE_VERSION,
    fallbackUsed: false,
    participants: { viewerUserId: "v1", candidateUserId: "c1" },
    scenarioResults: rows,
    overallSimulationAssessment: baseOverall({
      crossScenarioConsistency: "风险信号突出。",
      mainStrengths: [],
      mainRisks: ["道德绑架", "必须马上回应", "不尊重拒绝"],
      confidence: 0.55,
    }),
  };
}

/** 5) 对话好但静态风险高。 */
export function calibrationHighStaticRiskGoodChat(): AiSimulationLlmPayloadV2 {
  const signals: RrmScenarioResultV2["signals"] = {
    topicContinuity: "自然顺畅承接延展",
    emotionalSafety: "尊重边界低压力",
    mutualInvestment: "双向投入稳定",
    pressureOrBoundaryRisk: "低压力",
    nextStepSuitability: "continue_lightly",
    conversationMomentum: "可延展",
    repairPotential: "易圆场",
  };
  const rows = RRM_SCENARIO_KEYS_ORDERED.map((k, i) =>
    buildRow(k, i, {
      scenarioScore: 0.86,
      transcript: (j) => `${k}轮${j}：轻松自然，互相理解。`,
      signals,
    }),
  );
  return {
    schemaVersion: 2,
    sourceType: "test",
    sourceVersion: AI_SIMULATION_RRM_SOURCE_VERSION,
    fallbackUsed: false,
    participants: { viewerUserId: "v1", candidateUserId: "c1" },
    scenarioResults: rows,
    overallSimulationAssessment: baseOverall({
      crossScenarioConsistency: "一致自然。",
      mainStrengths: ["沟通顺畅"],
      mainRisks: ["节奏冲突", "生活节奏不合", "关系目标分歧", "长期现实成本"],
      confidence: 0.78,
    }),
  };
}

export function staticContextHighStaticRisk() {
  return {
    reviewStaticScore: 72,
    majorFits: ["表面沟通合拍"],
    majorRisks: [
      "婚姻期待与生育意愿差异偏大",
      "生活节奏长期不合风险",
      "安全感需求冲突",
      "沟通方式潜在冲突",
      "冲突处理方式风险偏高",
    ],
    relationshipGoalHint: "婚姻期待标量差异偏大，相处时需对齐长期预期。",
    axes: {
      marriageExpectation: { viewer: 2, candidate: 9 },
      lifePace: { viewer: 3, candidate: 9 },
      childrenIntent: { viewer: 2, candidate: 8 },
    },
  };
}

/** 6a) 旧 3 场景。 */
export { buildLegacyThreeScenarioV2Payload } from "../ai-simulation-v2-seven-scenarios";

/** 6b) 七场景但 sourceVersion 非 v2。 */
export function calibrationWrongSourceVersion(): AiSimulationLlmPayloadV2 {
  const p = calibrationHighQualityContinueLightly();
  return { ...p, sourceVersion: AI_SIMULATION_RRM_SOURCE_VERSION_LEGACY_V1 };
}
