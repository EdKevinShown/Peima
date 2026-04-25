import {
  parseAndValidateAiSimulationLlmPayloadV1,
} from "../src/modules/ai-simulation-v1/ai-simulation-v1-llm-payload.validate";
import { TRANSCRIPT_LITE_NARRATOR_ROUND } from "../src/modules/ai-simulation-v1/ai-simulation-v1.constants";

function validPayload() {
  const rounds = [1, 2, 3, 4].map((r) => ({
    round: r,
    speaker: r === TRANSCRIPT_LITE_NARRATOR_ROUND ? ("narrator" as const) : r % 2 === 1 ? ("viewer" as const) : ("candidate" as const),
    intent_tag: "open_up",
    text: "短句",
  }));
  return {
    schemaVersion: "ai_simulation_llm_payload_v1",
    transcript_lite: {
      schemaVersion: "transcript_lite_v1",
      rounds,
    },
    evaluator: {
      continue_recommendation: "hold",
      risk_tags: ["cold_field"],
      mitigation_hints: ["提示"],
      simulationRankScore: 0.61234,
      confidence: "medium",
    },
  };
}

describe("parseAndValidateAiSimulationLlmPayloadV1", () => {
  it("accepts valid payload", () => {
    const raw = JSON.stringify(validPayload());
    const out = parseAndValidateAiSimulationLlmPayloadV1(raw);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.payload.transcript_lite.rounds.length).toBe(4);
      expect(out.payload.evaluator.simulationRankScore).toBe(0.6123);
    }
  });

  it("rejects parse errors", () => {
    const out = parseAndValidateAiSimulationLlmPayloadV1("not json");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure).toBe("parse");
  });

  it("accepts simulationRankScore as JSON string (model quirk)", () => {
    const p = validPayload();
    (p.evaluator as { simulationRankScore: unknown }).simulationRankScore = "0.65";
    const out = parseAndValidateAiSimulationLlmPayloadV1(JSON.stringify(p));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.payload.evaluator.simulationRankScore).toBe(0.65);
    }
  });

  it("rejects schema (wrong round count) with detail", () => {
    const p = validPayload();
    (p.transcript_lite as { rounds: unknown[] }).rounds = (p.transcript_lite as { rounds: unknown[] }).rounds.slice(
      0,
      3,
    );
    const out = parseAndValidateAiSimulationLlmPayloadV1(JSON.stringify(p));
    expect(out.ok).toBe(false);
    if (!out.ok && out.failure === "schema") {
      expect(out.detail.path).toBe("transcript_lite.rounds");
      expect(out.detail.reason).toBe("expected_array_length_4");
    }
  });

  it("rejects schema (bad intent_tag) with detail", () => {
    const p = validPayload();
    (p.transcript_lite.rounds[0] as { intent_tag: string }).intent_tag = "Open-Up";
    const out = parseAndValidateAiSimulationLlmPayloadV1(JSON.stringify(p));
    expect(out.ok).toBe(false);
    if (!out.ok && out.failure === "schema") {
      expect(out.detail.path).toBe("transcript_lite.rounds[0].intent_tag");
      expect(out.detail.reason).toBe("expected_snake_case");
    }
  });
});
