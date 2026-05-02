import { parseAndValidateAiSimulationLlmPayloadAny } from "../src/modules/ai-simulation-v1/ai-simulation-v1-llm-payload.validate";
import { parseAndValidateAiSimulationLlmPayloadV2 } from "../src/modules/ai-simulation-v1/ai-simulation-v2-llm-payload.validate";
import { buildAiSimulationV2SystemPrompt } from "../src/modules/ai-simulation-v1/ai-simulation-v1-prompt";
import {
  normalizeAiSimulationV2PayloadScenarioTranscripts,
  normalizeOneSimulationTranscriptItem,
  offendingTypeOfValue,
} from "../src/modules/ai-simulation-v1/ai-simulation-v2-transcript-normalize";
import { buildValidAiSimulationV2Payload } from "./fixtures/ai-simulation-v2-seven-scenarios";

function eightViewerCandidateStringLines(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const sp = i % 2 === 0 ? "viewer" : "candidate";
    out.push(`${sp}: 场景0第${i + 1}句，轻松自然聊聊近况与兴趣。`);
  }
  return out;
}

describe("buildAiSimulationV2SystemPrompt", () => {
  it("requires simulationTranscript as array of objects with speaker/message shape", () => {
    const p = buildAiSimulationV2SystemPrompt();
    expect(p).toContain("simulationTranscript MUST be an array of JSON objects only");
    expect(p).toContain('"speaker": "viewer"');
    expect(p).toContain('"speaker": "candidate"');
    expect(p).toContain("Do NOT use strings like");
    expect(p).toContain("Do NOT use arrays like");
  });

  it("requires exactly 8 messages per scenario and alternating speaker order", () => {
    const p = buildAiSimulationV2SystemPrompt();
    expect(p).toContain("exactly 8 messages");
    expect(p).toContain("The speaker order MUST alternate exactly as:");
    expect(p).toContain("(1) viewer");
    expect(p).toContain("(8) candidate");
    expect(p).toContain("Do not output fewer than 8 messages");
    expect(p).toContain("Do not output more than 8 messages");
  });
});

describe("normalizeOneSimulationTranscriptItem", () => {
  it('converts "viewer: hello" to object', () => {
    expect(normalizeOneSimulationTranscriptItem("viewer: hello")).toEqual({
      speaker: "viewer",
      message: "hello",
    });
  });

  it('converts "candidate: hello" to object', () => {
    expect(normalizeOneSimulationTranscriptItem("candidate: hello")).toEqual({
      speaker: "candidate",
      message: "hello",
    });
  });

  it("converts Chinese colon prefix", () => {
    expect(normalizeOneSimulationTranscriptItem("viewer：你好啊")).toEqual({
      speaker: "viewer",
      message: "你好啊",
    });
  });

  it('converts ["viewer", "hello"] tuple', () => {
    expect(normalizeOneSimulationTranscriptItem(["viewer", "hello"])).toEqual({
      speaker: "viewer",
      message: "hello",
    });
  });

  it('converts ["candidate", "hello"] tuple', () => {
    expect(normalizeOneSimulationTranscriptItem(["candidate", "hello"])).toEqual({
      speaker: "candidate",
      message: "hello",
    });
  });

  it("does not convert invalid speaker tuple", () => {
    const x = ["user", "hello"] as unknown[];
    expect(normalizeOneSimulationTranscriptItem(x)).toBe(x);
  });

  it("does not convert narrator-prefixed string", () => {
    expect(normalizeOneSimulationTranscriptItem("narrator: stage direction")).toBe(
      "narrator: stage direction",
    );
  });

  it("does not convert empty message after colon", () => {
    expect(normalizeOneSimulationTranscriptItem("viewer:   ")).toBe("viewer:   ");
  });

  it("trims already-valid object messages", () => {
    expect(
      normalizeOneSimulationTranscriptItem({ speaker: "viewer", message: "  hi  " }),
    ).toEqual({ speaker: "viewer", message: "hi" });
  });
});

describe("normalizeAiSimulationV2PayloadScenarioTranscripts", () => {
  it("mutates scenarioResults simulationTranscript arrays in place", () => {
    const root = {
      scenarioResults: [
        {
          simulationTranscript: ["viewer: a", ["candidate", "b"]],
        },
      ],
    } as Record<string, unknown>;
    normalizeAiSimulationV2PayloadScenarioTranscripts(root);
    const sr = root.scenarioResults as { simulationTranscript: unknown[] }[];
    expect(sr[0].simulationTranscript[0]).toEqual({ speaker: "viewer", message: "a" });
    expect(sr[0].simulationTranscript[1]).toEqual({ speaker: "candidate", message: "b" });
  });
});

describe("parseAndValidateAiSimulationLlmPayloadV2 + normalization", () => {
  it("accepts v2 payload when messages are viewer:/candidate: strings (normalized)", () => {
    const p = buildValidAiSimulationV2Payload();
    p.scenarioResults[0].simulationTranscript =
      eightViewerCandidateStringLines() as unknown as typeof p.scenarioResults[0]["simulationTranscript"];
    const out = parseAndValidateAiSimulationLlmPayloadV2(JSON.stringify(p));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.payload.scenarioResults[0].simulationTranscript[0]).toEqual({
        speaker: "viewer",
        message: expect.any(String),
      });
    }
  });

  it("schema_validation is not returned as invalid_json from parseAndValidateAiSimulationLlmPayloadAny", () => {
    const p = buildValidAiSimulationV2Payload();
    (p.scenarioResults[0] as { scenarioApproachIntensity: number }).scenarioApproachIntensity = 0.99;
    const out = parseAndValidateAiSimulationLlmPayloadAny(JSON.stringify(p));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure).toBe("schema");
    }
  });
});

describe("offendingTypeOfValue", () => {
  it("classifies transcript drift types", () => {
    expect(offendingTypeOfValue("x")).toBe("string");
    expect(offendingTypeOfValue(["a", "b"])).toBe("array");
    expect(offendingTypeOfValue(null)).toBe("null");
    expect(offendingTypeOfValue({})).toBe("object");
  });
});

describe("schema failure detail for non-object transcript item", () => {
  it("includes expectedShape and offendingType on expected_object", () => {
    const p = buildValidAiSimulationV2Payload();
    p.scenarioResults[0].simulationTranscript = [
      123,
      ...eightViewerCandidateStringLines().slice(1),
    ] as unknown as typeof p.scenarioResults[0]["simulationTranscript"];
    const out = parseAndValidateAiSimulationLlmPayloadV2(JSON.stringify(p));
    expect(out.ok).toBe(false);
    if (!out.ok && out.failure === "schema") {
      expect(out.detail.path).toBe("scenarioResults[0].simulationTranscript[0]");
      expect(out.detail.reason).toBe("expected_object");
      expect(out.detail.expectedShape).toContain("speaker");
      expect(out.detail.offendingType).toBe("number");
      expect(out.detail.normalizationAttempted).toBe(true);
    }
  });
});
