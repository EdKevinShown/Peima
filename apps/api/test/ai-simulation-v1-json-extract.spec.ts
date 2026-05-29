import { parseAndValidateAiSimulationLlmPayloadAny } from "../src/modules/ai-simulation-v1/ai-simulation-v1-llm-payload.validate";
import {
  buildInvalidJsonObservabilityDetail,
  extractBalancedJsonObjectSlice,
  extractJsonObjectFromLlmText,
} from "../src/modules/ai-simulation-v1/ai-simulation-v1-json-extract";

describe("extractJsonObjectFromLlmText", () => {
  it("parses pure JSON object", () => {
    const r = extractJsonObjectFromLlmText(`{ "schemaVersion": 2 }`);
    expect(r).toEqual({ ok: true, jsonText: `{ "schemaVersion": 2 }` });
  });

  it("parses ```json fenced JSON", () => {
    const r = extractJsonObjectFromLlmText("```json\n{ \"a\": 1 }\n```");
    expect(r).toEqual({ ok: true, jsonText: `{ "a": 1 }` });
  });

  it("parses fenced block without language tag", () => {
    const r = extractJsonObjectFromLlmText("```\n{ \"x\": true }\n```");
    expect(r).toEqual({ ok: true, jsonText: `{ "x": true }` });
  });

  it("parses leading/trailing prose", () => {
    const r = extractJsonObjectFromLlmText(
      'Here is the JSON:\n{ "schemaVersion": 2 }\nThanks.',
    );
    expect(r).toEqual({ ok: true, jsonText: `{ "schemaVersion": 2 }` });
  });

  it("handles BOM and extra whitespace", () => {
    const r = extractJsonObjectFromLlmText(`\uFEFF  { "k": 1 }  `);
    expect(r).toEqual({ ok: true, jsonText: `{ "k": 1 }` });
  });

  it("returns truncated_or_unbalanced_json for truncated object", () => {
    const r = extractJsonObjectFromLlmText(`{"schemaVersion": 2, "scenarioResults": [`);
    expect(r).toEqual({ ok: false, reason: "truncated_or_unbalanced_json" });
  });

  it("returns no_json_object_found for empty after trim", () => {
    const r = extractJsonObjectFromLlmText("   \n\t  ");
    expect(r).toEqual({ ok: false, reason: "no_json_object_found" });
  });

  it("returns fenced_json_unwrapped_failed when fence is not closed", () => {
    const r = extractJsonObjectFromLlmText("```json\n{\"a\":1}\n");
    expect(r).toEqual({ ok: false, reason: "fenced_json_unwrapped_failed" });
  });

  it("extracts first object when braces appear inside string values", () => {
    const r = extractJsonObjectFromLlmText(`{"hint": "use {curly} sparingly", "schemaVersion": 2}`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(JSON.parse(r.jsonText).schemaVersion).toBe(2);
    }
  });
});

describe("extractBalancedJsonObjectSlice", () => {
  it("balances nested objects", () => {
    const s = `prefix {"outer":{"inner":1}} tail`;
    const i = s.indexOf("{");
    const r = extractBalancedJsonObjectSlice(s, i);
    expect("jsonText" in r && r.jsonText).toBe(`{"outer":{"inner":1}}`);
  });
});

describe("buildInvalidJsonObservabilityDetail", () => {
  it("includes stage, reason, rawContentLength, snippet within 800 chars", () => {
    const long = "x".repeat(1200);
    const d = buildInvalidJsonObservabilityDetail({
      reason: "json_parse_error",
      parseMessage: "Unexpected token",
      rawContent: long,
    });
    expect(d.stage).toBe("json_parse");
    expect(d.reason).toBe("json_parse_error");
    expect(d.rawContentLength).toBe(1200);
    expect(String(d.rawContentSnippet).length).toBeLessThanOrEqual(801);
    expect(d.rawContentTailSnippet).toBeDefined();
    expect(String(d.rawContentTailSnippet).length).toBeLessThanOrEqual(401);
  });

  it("omits tail when content short", () => {
    const d = buildInvalidJsonObservabilityDetail({
      reason: "empty_content",
      rawContent: "",
    });
    expect(d.rawContentLength).toBe(0);
    expect(d.rawContentSnippet).toBeUndefined();
    expect(d.rawContentTailSnippet).toBeUndefined();
  });
});

describe("parseAndValidateAiSimulationLlmPayloadAny vs invalid_json", () => {
  it("returns schema failure (not parse) for valid JSON that violates v2 shape", () => {
    const r = parseAndValidateAiSimulationLlmPayloadAny(
      JSON.stringify({
        schemaVersion: 2,
        scenarioResults: [],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure).toBe("schema");
    }
  });
});
