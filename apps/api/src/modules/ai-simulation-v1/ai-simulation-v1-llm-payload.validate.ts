import {
  AI_SIMULATION_LLM_PAYLOAD_SCHEMA,
  TRANSCRIPT_LITE_NARRATOR_ROUND,
  TRANSCRIPT_LITE_SCHEMA_VERSION,
} from "./ai-simulation-v1.constants";
import type { AiSimulationLlmPayloadV1, TranscriptLiteRoundV1 } from "./ai-simulation-v1.types";

const SPEAKERS = new Set(["viewer", "candidate", "narrator"]);
const CONTINUE = new Set(["explore_more", "hold", "slow_down"]);
const CONF = new Set(["high", "medium", "low"]);

/** First schema failure (persisted on item when errorCode is schema_validation). */
export type AiSimulationV1SchemaFailureDetail = {
  path: string;
  reason: string;
};

export type ParseValidateAiSimulationLlmPayloadV1Result =
  | { ok: true; payload: AiSimulationLlmPayloadV1 }
  | { ok: false; failure: "parse" }
  | { ok: false; failure: "schema"; detail: AiSimulationV1SchemaFailureDetail };

function isSnakeTag(s: string, maxLen: number): boolean {
  if (s.length === 0 || s.length > maxLen) return false;
  return /^[a-z][a-z0-9_]*$/.test(s);
}

/** LLM sometimes emits simulationRankScore as a string; accept finite numeric string only. */
function normalizeSimulationRankScore(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function schema(detail: AiSimulationV1SchemaFailureDetail): Extract<ParseValidateAiSimulationLlmPayloadV1Result, { ok: false }> {
  return { ok: false, failure: "schema", detail };
}

function validateRoundOrFail(
  r: unknown,
  index: number,
): { ok: true; row: TranscriptLiteRoundV1 } | { ok: false; detail: AiSimulationV1SchemaFailureDetail } {
  const base = `transcript_lite.rounds[${index}]`;
  if (typeof r !== "object" || r === null) {
    return { ok: false, detail: { path: base, reason: "expected_object" } };
  }
  const o = r as Record<string, unknown>;
  const round = o.round;
  const speaker = o.speaker;
  const intent_tag = o.intent_tag;
  const text = o.text;
  if (typeof round !== "number" || Math.round(round) !== round) {
    return { ok: false, detail: { path: `${base}.round`, reason: "expected_integer" } };
  }
  if (round !== index + 1) {
    return { ok: false, detail: { path: `${base}.round`, reason: "expected_round_index" } };
  }
  if (typeof speaker !== "string" || !SPEAKERS.has(speaker)) {
    return { ok: false, detail: { path: `${base}.speaker`, reason: "expected_enum" } };
  }
  if (typeof intent_tag !== "string" || !isSnakeTag(intent_tag, 32)) {
    return { ok: false, detail: { path: `${base}.intent_tag`, reason: "expected_snake_case" } };
  }
  if (typeof text !== "string" || text.length === 0 || text.length > 120) {
    return { ok: false, detail: { path: `${base}.text`, reason: "expected_nonempty_max_120" } };
  }
  return {
    ok: true,
    row: {
      round,
      speaker: speaker as TranscriptLiteRoundV1["speaker"],
      intent_tag,
      text,
    },
  };
}

/**
 * Returns parsed payload; `failure` distinguishes retryable JSON parse vs non-retryable schema.
 * On schema failure, `detail` is the first check that failed (path + stable reason).
 */
export function parseAndValidateAiSimulationLlmPayloadV1(rawText: string): ParseValidateAiSimulationLlmPayloadV1Result {
  let obj: unknown;
  try {
    obj = JSON.parse(rawText) as unknown;
  } catch {
    return { ok: false, failure: "parse" };
  }
  if (typeof obj !== "object" || obj === null) {
    return schema({ path: "payload", reason: "expected_object" });
  }
  const root = obj as Record<string, unknown>;
  if (root.schemaVersion !== AI_SIMULATION_LLM_PAYLOAD_SCHEMA) {
    return schema({ path: "schemaVersion", reason: "expected_literal" });
  }

  const tl = root.transcript_lite;
  if (typeof tl !== "object" || tl === null) {
    return schema({ path: "transcript_lite", reason: "expected_object" });
  }
  const tlo = tl as Record<string, unknown>;
  if (tlo.schemaVersion !== TRANSCRIPT_LITE_SCHEMA_VERSION) {
    return schema({ path: "transcript_lite.schemaVersion", reason: "expected_literal" });
  }
  if (!Array.isArray(tlo.rounds) || tlo.rounds.length !== 4) {
    return schema({ path: "transcript_lite.rounds", reason: "expected_array_length_4" });
  }

  let narratorCount = 0;
  const rounds: TranscriptLiteRoundV1[] = [];
  for (let i = 0; i < 4; i += 1) {
    const r = tlo.rounds[i];
    const vr = validateRoundOrFail(r, i);
    if (!vr.ok) return schema(vr.detail);
    const row = vr.row;
    if (row.speaker === "narrator") {
      narratorCount += 1;
      if (narratorCount > 1) {
        return schema({
          path: `transcript_lite.rounds[${i}].speaker`,
          reason: "narrator_at_most_once",
        });
      }
      if (row.round !== TRANSCRIPT_LITE_NARRATOR_ROUND) {
        return schema({
          path: `transcript_lite.rounds[${i}].round`,
          reason: "narrator_wrong_round",
        });
      }
    }
    rounds.push(row);
  }

  const ev = root.evaluator;
  if (typeof ev !== "object" || ev === null) {
    return schema({ path: "evaluator", reason: "expected_object" });
  }
  const evo = ev as Record<string, unknown>;
  const cr = evo.continue_recommendation;
  const rt = evo.risk_tags;
  const mh = evo.mitigation_hints;
  const srsRaw = evo.simulationRankScore;
  const conf = evo.confidence;
  if (typeof cr !== "string" || !CONTINUE.has(cr)) {
    return schema({ path: "evaluator.continue_recommendation", reason: "expected_enum" });
  }
  if (!Array.isArray(rt) || rt.length > 6) {
    return schema({ path: "evaluator.risk_tags", reason: "expected_array_max_6" });
  }
  for (let j = 0; j < rt.length; j += 1) {
    const t = rt[j];
    if (typeof t !== "string" || !isSnakeTag(t, 32)) {
      return schema({ path: `evaluator.risk_tags[${j}]`, reason: "expected_snake_case" });
    }
  }
  if (!Array.isArray(mh) || mh.length > 3) {
    return schema({ path: "evaluator.mitigation_hints", reason: "expected_array_max_3" });
  }
  for (let j = 0; j < mh.length; j += 1) {
    const h = mh[j];
    if (typeof h !== "string" || h.length === 0 || h.length > 80) {
      return schema({
        path: `evaluator.mitigation_hints[${j}]`,
        reason: "expected_nonempty_max_80",
      });
    }
  }
  const srs = normalizeSimulationRankScore(srsRaw);
  if (srs === null) {
    return schema({
      path: "evaluator.simulationRankScore",
      reason: "expected_finite_number_in_0_1",
    });
  }
  if (srs < 0 || srs > 1) {
    return schema({
      path: "evaluator.simulationRankScore",
      reason: "out_of_range_0_1",
    });
  }
  if (typeof conf !== "string" || !CONF.has(conf)) {
    return schema({ path: "evaluator.confidence", reason: "expected_enum" });
  }

  const simulationRankScore = Math.round(srs * 10_000) / 10_000;

  return {
    ok: true,
    payload: {
      schemaVersion: AI_SIMULATION_LLM_PAYLOAD_SCHEMA,
      transcript_lite: {
        schemaVersion: TRANSCRIPT_LITE_SCHEMA_VERSION,
        rounds,
      },
      evaluator: {
        continue_recommendation: cr as "explore_more" | "hold" | "slow_down",
        risk_tags: rt as string[],
        mitigation_hints: mh as string[],
        simulationRankScore,
        confidence: conf as "high" | "medium" | "low",
      },
    },
  };
}

/** Strip optional ```json fences from model output. */
export function extractJsonObjectString(content: string): string {
  const t = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence) {
    return fence[1].trim();
  }
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i >= 0 && j > i) {
    return t.slice(i, j + 1);
  }
  return t;
}
