/**
 * M3.1-real-normalization-integration-check:
 * Ensures parseAndValidateAiSimulationLlmPayloadAny → V2 path runs normalization,
 * and v2 schema failures preserve observability fields through the "any" router.
 */
import { parseAndValidateAiSimulationLlmPayloadAny } from "../src/modules/ai-simulation-v1/ai-simulation-v1-llm-payload.validate";
import type { AiSimulationLlmPayloadV2 } from "../src/modules/ai-simulation-v1/ai-simulation-v1.types";
import { buildValidAiSimulationV2Payload } from "./fixtures/ai-simulation-v2-seven-scenarios";

describe("parseAndValidateAiSimulationLlmPayloadAny + v2 normalization (integration)", () => {
  it('normalizes scenarioResults[0].simulationTranscript[0] from "viewer: hello" and succeeds', () => {
    const p = buildValidAiSimulationV2Payload();
    const t = [...p.scenarioResults[0].simulationTranscript];
    t[0] = "viewer: hello" as unknown as (typeof t)[0];
    p.scenarioResults[0].simulationTranscript = t;

    const out = parseAndValidateAiSimulationLlmPayloadAny(JSON.stringify(p));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.version).toBe(2);
      const pl = out.payload as AiSimulationLlmPayloadV2;
      const m0 = pl.scenarioResults[0].simulationTranscript[0];
      expect(m0).toEqual({ speaker: "viewer", message: "hello" });
    }
  });

  it('does not normalize "narrator: hello"; schema failure detail includes observability fields', () => {
    const p = buildValidAiSimulationV2Payload();
    const t = [...p.scenarioResults[0].simulationTranscript];
    t[0] = "narrator: hello" as unknown as (typeof t)[0];
    p.scenarioResults[0].simulationTranscript = t;

    const out = parseAndValidateAiSimulationLlmPayloadAny(JSON.stringify(p));
    expect(out.ok).toBe(false);
    if (!out.ok && out.failure === "schema") {
      expect(out.detail.path).toBe("scenarioResults[0].simulationTranscript[0]");
      expect(out.detail.reason).toBe("expected_object");
      expect(out.detail.expectedShape).toContain("speaker");
      expect(out.detail.offendingType).toBe("string");
      expect(out.detail.normalizationAttempted).toBe(true);
    }
  });
});
