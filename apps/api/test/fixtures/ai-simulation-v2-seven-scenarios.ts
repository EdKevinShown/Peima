import {
  AI_SIMULATION_RRM_SOURCE_VERSION,
  AI_SIMULATION_RRM_SOURCE_VERSION_LEGACY_V1,
  RRM_SCENARIO_APPROACH_INTENSITY,
  RRM_SCENARIO_KEYS_ORDERED,
} from "../../src/modules/ai-simulation-v1/ai-simulation-v1-rrm.constants";
import type { AiSimulationLlmPayloadV2 } from "../../src/modules/ai-simulation-v1/ai-simulation-v1.types";

function eightMsgs(scenarioKey: string, slot: number) {
  const lines = [];
  for (let i = 0; i < 8; i += 1) {
    const speaker = i % 2 === 0 ? ("viewer" as const) : ("candidate" as const);
    const line = `${scenarioKey}槽${slot}轮${i + 1}：聊聊近况与兴趣，语气自然轻松。`;
    lines.push({ speaker, message: line.slice(0, 160) });
  }
  return lines;
}

function signalsFor(slot: number) {
  const n = String(slot);
  return {
    topicContinuity: `话题承接顺畅度${n}`,
    emotionalSafety: "对话有留白与尊重",
    mutualInvestment: "双向试探较均衡",
    pressureOrBoundaryRisk: "压力低边界清晰",
    nextStepSuitability: "continue_lightly",
    conversationMomentum: "可自然延展",
    repairPotential: "易圆场",
  };
}

export type BuildValidV2Opts = {
  viewerUserId?: string;
  candidateUserId?: string;
  /** Per-scenario score override by index 0..6 */
  scenarioScores?: number[];
};

/** Minimal valid v2 payload (7 scenarios, fixed order & intensities) for API tests. */
export function buildValidAiSimulationV2Payload(opts?: BuildValidV2Opts): AiSimulationLlmPayloadV2 {
  const viewerUserId = opts?.viewerUserId ?? "v1";
  const candidateUserId = opts?.candidateUserId ?? "c1";
  const scores = opts?.scenarioScores ?? RRM_SCENARIO_KEYS_ORDERED.map(() => 0.72);

  const scenarioResults = RRM_SCENARIO_KEYS_ORDERED.map((k, idx) => ({
    scenario: k,
    scenarioApproachIntensity: RRM_SCENARIO_APPROACH_INTENSITY[k],
    simulationTranscript: eightMsgs(k, idx),
    simulationSummary: `本段围绕「${k}」的摘要：互动温和、尊重节奏。`,
    signals: signalsFor(idx),
    evaluator: {
      scenarioScore: Math.min(1, Math.max(0, scores[idx] ?? 0.72)),
      confidence: 0.8,
    },
  }));

  return {
    schemaVersion: 2,
    sourceType: "test",
    sourceVersion: AI_SIMULATION_RRM_SOURCE_VERSION,
    fallbackUsed: false,
    participants: { viewerUserId, candidateUserId },
    scenarioResults,
    overallSimulationAssessment: {
      crossScenarioConsistency: "七段场景语气一致，均为低压力试探与尊重边界。",
      mainStrengths: ["自然接话", "尊重边界"],
      mainRisks: ["信息仍浅", "需线下验证"],
      recommendedOpeningStyle: "从轻松近况与共同兴趣切入。",
      confidence: 0.66,
    },
  };
}

/** Pre–M0.8 shape (3 scenarios); still accepted by `isAiSimulationTranscriptLiteV2` for read/sidecars. */
export function buildLegacyThreeScenarioV2Payload(): AiSimulationLlmPayloadV2 {
  const keys = ["low_pressure_first_chat", "personal_sharing", "low_pressure_invitation"] as const;
  const int: Record<(typeof keys)[number], number> = {
    low_pressure_first_chat: 0.2,
    personal_sharing: 0.35,
    low_pressure_invitation: 0.45,
  };
  const scenarioResults = keys.map((k, idx) => ({
    scenario: k,
    scenarioApproachIntensity: int[k],
    simulationTranscript: eightMsgs(`legacy-${k}`, idx + 100),
    simulationSummary: `旧版三场景摘要：${k}。`,
    signals: signalsFor(idx + 20),
    evaluator: { scenarioScore: 0.7, confidence: 0.75 },
  }));
  return {
    schemaVersion: 2,
    sourceType: "test",
    sourceVersion: AI_SIMULATION_RRM_SOURCE_VERSION_LEGACY_V1,
    fallbackUsed: false,
    participants: { viewerUserId: "v1", candidateUserId: "c1" },
    scenarioResults,
    overallSimulationAssessment: {
      crossScenarioConsistency: "三场景语气相近。",
      mainStrengths: ["自然"],
      mainRisks: ["仍浅"],
      recommendedOpeningStyle: "轻松开场。",
      confidence: 0.55,
    },
  };
}
