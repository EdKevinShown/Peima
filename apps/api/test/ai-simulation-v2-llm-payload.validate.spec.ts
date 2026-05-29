import { parseAndValidateAiSimulationLlmPayloadAny } from "../src/modules/ai-simulation-v1/ai-simulation-v1-llm-payload.validate";
import { parseAndValidateAiSimulationLlmPayloadV2 } from "../src/modules/ai-simulation-v1/ai-simulation-v2-llm-payload.validate";
import { buildLegacyEvaluatorShimFromV2 } from "../src/modules/ai-simulation-v1/ai-simulation-v1-legacy-evaluator-shim";
import {
  AI_SIMULATION_RRM_SOURCE_VERSION,
  AI_SIMULATION_RRM_SOURCE_VERSION_LEGACY_V1,
  RRM_SCENARIO_KEYS_ORDERED,
} from "../src/modules/ai-simulation-v1/ai-simulation-v1-rrm.constants";
import { isAiSimulationTranscriptLiteV2 } from "../src/modules/ai-simulation-v1/shortlist-four-dim-from-simulation-v2";
import {
  buildLegacyThreeScenarioV2Payload,
  buildValidAiSimulationV2Payload,
} from "./fixtures/ai-simulation-v2-seven-scenarios";

describe("parseAndValidateAiSimulationLlmPayloadV2", () => {
  it("accepts valid v2 payload with 7 scenarioResults", () => {
    const raw = JSON.stringify(buildValidAiSimulationV2Payload());
    const out = parseAndValidateAiSimulationLlmPayloadV2(raw);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.payload.sourceVersion).toBe(AI_SIMULATION_RRM_SOURCE_VERSION);
      expect(out.payload.scenarioResults.length).toBe(7);
      expect(out.payload.scenarioResults.map((r) => r.scenario)).toEqual([...RRM_SCENARIO_KEYS_ORDERED]);
      expect(out.payload.scenarioResults[0].simulationTranscript.length).toBe(8);
      for (const r of out.payload.scenarioResults) {
        expect(r.simulationTranscript.length).toBeGreaterThanOrEqual(8);
        expect(r.simulationTranscript.length).toBeLessThanOrEqual(16);
      }
    }
  });

  it("rejects wrong scenario order", () => {
    const p = buildValidAiSimulationV2Payload();
    (p.scenarioResults[1] as { scenario: string }).scenario = "low_pressure_invitation";
    const out = parseAndValidateAiSimulationLlmPayloadV2(JSON.stringify(p));
    expect(out.ok).toBe(false);
  });

  it("rejects legacy 3-scenario length for new completions", () => {
    const out = parseAndValidateAiSimulationLlmPayloadV2(JSON.stringify(buildLegacyThreeScenarioV2Payload()));
    expect(out.ok).toBe(false);
    if (!out.ok && out.failure === "schema") {
      expect(out.detail.path).toBe("scenarioResults");
    }
  });

  it("rejects too few messages", () => {
    const p = buildValidAiSimulationV2Payload();
    p.scenarioResults[0].simulationTranscript = p.scenarioResults[0].simulationTranscript.slice(0, 6);
    const out = parseAndValidateAiSimulationLlmPayloadV2(JSON.stringify(p));
    expect(out.ok).toBe(false);
    if (!out.ok && out.failure === "schema") {
      expect(out.detail.reason).toBe("expected_length_8_to_16");
      expect(out.detail.actualLength).toBe(6);
      expect(out.detail.expectedMin).toBe(8);
      expect(out.detail.expectedMax).toBe(16);
      expect(out.detail.scenario).toBe("low_pressure_first_chat");
    }
  });

  it("rejects too many messages with observability detail", () => {
    const p = buildValidAiSimulationV2Payload();
    const t = p.scenarioResults[0].simulationTranscript;
    const extra: typeof t = [
      ...t,
      { speaker: "viewer" as const, message: "多一行viewer" },
      { speaker: "candidate" as const, message: "多一行candidate" },
      { speaker: "viewer" as const, message: "再多viewer" },
      { speaker: "candidate" as const, message: "再多candidate" },
      { speaker: "viewer" as const, message: "再多2 viewer" },
      { speaker: "candidate" as const, message: "再多2 candidate" },
      { speaker: "viewer" as const, message: "再多3 viewer" },
      { speaker: "candidate" as const, message: "再多3 candidate" },
      { speaker: "viewer" as const, message: "再多4 viewer" },
    ];
    p.scenarioResults[0].simulationTranscript = extra;
    const out = parseAndValidateAiSimulationLlmPayloadV2(JSON.stringify(p));
    expect(out.ok).toBe(false);
    if (!out.ok && out.failure === "schema") {
      expect(out.detail.reason).toBe("expected_length_8_to_16");
      expect(out.detail.actualLength).toBe(17);
      expect(out.detail.expectedMin).toBe(8);
      expect(out.detail.expectedMax).toBe(16);
    }
  });

  it("accepts transcript length 12 (within 8–16)", () => {
    const p = buildValidAiSimulationV2Payload();
    const t = p.scenarioResults[0].simulationTranscript;
    const more: typeof t = [
      ...t,
      { speaker: "viewer" as const, message: "第九句viewer补充" },
      { speaker: "candidate" as const, message: "第十句candidate回应" },
      { speaker: "viewer" as const, message: "第十一句viewer" },
      { speaker: "candidate" as const, message: "第十二句candidate" },
    ];
    p.scenarioResults[0].simulationTranscript = more;
    const out = parseAndValidateAiSimulationLlmPayloadV2(JSON.stringify(p));
    expect(out.ok).toBe(true);
  });

  it("rejects scenarioApproachIntensity mismatch", () => {
    const p = buildValidAiSimulationV2Payload();
    p.scenarioResults[2].scenarioApproachIntensity = 0.99;
    const out = parseAndValidateAiSimulationLlmPayloadV2(JSON.stringify(p));
    expect(out.ok).toBe(false);
    if (!out.ok && out.failure === "schema") {
      expect(out.detail.path).toContain("scenarioApproachIntensity");
    }
  });

  it("rejects 7-scenario payload with legacy sourceVersion v1 (new completions must use v2)", () => {
    const p = buildValidAiSimulationV2Payload();
    p.sourceVersion = AI_SIMULATION_RRM_SOURCE_VERSION_LEGACY_V1;
    const out = parseAndValidateAiSimulationLlmPayloadV2(JSON.stringify(p));
    expect(out.ok).toBe(false);
    if (!out.ok && out.failure === "schema") {
      expect(out.detail.path).toBe("sourceVersion");
      expect(out.detail.reason).toBe("expected_rrm_ready_v2_source_version");
    }
  });
});

describe("parseAndValidateAiSimulationLlmPayloadAny", () => {
  it("routes v2", () => {
    const out = parseAndValidateAiSimulationLlmPayloadAny(JSON.stringify(buildValidAiSimulationV2Payload()));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.version).toBe(2);
    }
  });
});

describe("buildLegacyEvaluatorShimFromV2", () => {
  it("produces EvaluatorV1-compatible fields", () => {
    const shim = buildLegacyEvaluatorShimFromV2(buildValidAiSimulationV2Payload());
    expect(typeof shim.simulationRankScore).toBe("number");
    expect(shim.simulationRankScore).toBeGreaterThanOrEqual(0);
    expect(shim.simulationRankScore).toBeLessThanOrEqual(1);
    expect(["high", "medium", "low"]).toContain(shim.confidence);
    expect(["explore_more", "hold", "slow_down"]).toContain(shim.continue_recommendation);
    expect(Array.isArray(shim.risk_tags)).toBe(true);
    expect(Array.isArray(shim.mitigation_hints)).toBe(true);
  });
});

describe("isAiSimulationTranscriptLiteV2 (legacy read)", () => {
  it("accepts pre-M0.8 three-scenario v2 for sidecar compatibility", () => {
    expect(isAiSimulationTranscriptLiteV2(buildLegacyThreeScenarioV2Payload())).toBe(true);
  });

  it("accepts seven-scenario v2", () => {
    expect(isAiSimulationTranscriptLiteV2(buildValidAiSimulationV2Payload())).toBe(true);
  });
});
