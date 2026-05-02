import {
  AI_SIMULATION_LLM_PAYLOAD_SCHEMA_V2,
  AI_SIMULATION_RRM_SOURCE_VERSION,
  RRM_NEXT_STEP_SUITABILITY,
  RRM_SCENARIO_APPROACH_INTENSITY,
  RRM_SCENARIO_KEYS_ORDERED,
} from "./ai-simulation-v1-rrm.constants";
import type {
  AiSimulationLlmPayloadV2,
  RrmOverallSimulationAssessmentV2,
  RrmScenarioResultV2,
  RrmScenarioSignalsV2,
} from "./ai-simulation-v1.types";
import {
  normalizeAiSimulationV2PayloadScenarioTranscripts,
  offendingTypeOfValue,
} from "./ai-simulation-v2-transcript-normalize";

/** Same shape as v1 schema failures (kept separate to avoid circular imports). */
export type AiSimulationV2SchemaFailureDetail = {
  path: string;
  reason: string;
  expectedShape?: string;
  offendingType?: string;
  normalizationAttempted?: boolean;
  /** Present when `reason` is `expected_length_8_to_16` (transcript array length). */
  actualLength?: number;
  expectedMin?: number;
  expectedMax?: number;
  /** Scenario key for the failing `scenarioResults[index]` row (no transcript text). */
  scenario?: string;
};

export type ParseValidateAiSimulationLlmPayloadV2Result =
  | { ok: true; payload: AiSimulationLlmPayloadV2 }
  | { ok: false; failure: "parse" }
  | { ok: false; failure: "schema"; detail: AiSimulationV2SchemaFailureDetail };

const MSG_MIN = 8;
const MSG_MAX = 16;
const MSG_LEN_MAX = 160;
const STR_SHORT_MAX = 240;
const SUMMARY_MAX = 900;
const OVERALL_LINE_MAX = 120;
const MAIN_LIST_MAX_ITEMS = 8;

function schema(detail: AiSimulationV2SchemaFailureDetail): Extract<ParseValidateAiSimulationLlmPayloadV2Result, { ok: false }> {
  return { ok: false, failure: "schema", detail };
}

function normalize01(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isNonEmptyShortString(s: unknown, max: number): s is string {
  return typeof s === "string" && s.trim().length > 0 && s.length <= max;
}

function validateNextStepSuitability(s: string): boolean {
  const t = s.trim();
  return (RRM_NEXT_STEP_SUITABILITY as readonly string[]).some((tok) => t === tok || t.includes(tok));
}

function validateSignals(
  o: unknown,
  base: string,
): { ok: true; row: RrmScenarioSignalsV2 } | { ok: false; failure: "schema"; detail: AiSimulationV2SchemaFailureDetail } {
  if (typeof o !== "object" || o === null) {
    return { ok: false, failure: "schema", detail: { path: base, reason: "expected_object" } };
  }
  const r = o as Record<string, unknown>;
  const keys: (keyof RrmScenarioSignalsV2)[] = [
    "topicContinuity",
    "emotionalSafety",
    "mutualInvestment",
    "pressureOrBoundaryRisk",
    "nextStepSuitability",
    "conversationMomentum",
    "repairPotential",
  ];
  const out: Partial<RrmScenarioSignalsV2> = {};
  for (const k of keys) {
    const v = r[k];
    if (!isNonEmptyShortString(v, STR_SHORT_MAX)) {
      return { ok: false, failure: "schema", detail: { path: `${base}.${k}`, reason: "expected_nonempty_short_string" } };
    }
    if (k === "nextStepSuitability" && !validateNextStepSuitability(v)) {
      return {
        ok: false,
        failure: "schema",
        detail: { path: `${base}.nextStepSuitability`, reason: "expected_next_step_token" },
      };
    }
    out[k] = v.trim();
  }
  return { ok: true, row: out as RrmScenarioSignalsV2 };
}

function validateScenario(
  raw: unknown,
  index: number,
  expectedKey: (typeof RRM_SCENARIO_KEYS_ORDERED)[number],
): { ok: true; row: RrmScenarioResultV2 } | { ok: false; failure: "schema"; detail: AiSimulationV2SchemaFailureDetail } {
  const base = `scenarioResults[${index}]`;
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, failure: "schema", detail: { path: base, reason: "expected_object" } };
  }
  const o = raw as Record<string, unknown>;
  if (o.scenario !== expectedKey) {
    return { ok: false, failure: "schema", detail: { path: `${base}.scenario`, reason: "expected_scenario_key_order" } };
  }
  const intensityRaw = o.scenarioApproachIntensity;
  const intensity =
    typeof intensityRaw === "number" && Number.isFinite(intensityRaw)
      ? intensityRaw
      : typeof intensityRaw === "string"
        ? Number(intensityRaw.trim())
        : NaN;
  const expectedI = RRM_SCENARIO_APPROACH_INTENSITY[expectedKey];
  if (!Number.isFinite(intensity) || Math.abs(intensity - expectedI) > 0.02) {
    return {
      ok: false,
      failure: "schema",
      detail: { path: `${base}.scenarioApproachIntensity`, reason: "expected_intensity_mismatch" },
    };
  }

  const msgs = o.simulationTranscript;
  if (!Array.isArray(msgs)) {
    return { ok: false, failure: "schema", detail: { path: `${base}.simulationTranscript`, reason: "expected_array" } };
  }
  if (msgs.length < MSG_MIN || msgs.length > MSG_MAX) {
    return {
      ok: false,
      failure: "schema",
      detail: {
        path: `${base}.simulationTranscript`,
        reason: "expected_length_8_to_16",
        actualLength: msgs.length,
        expectedMin: MSG_MIN,
        expectedMax: MSG_MAX,
        scenario: expectedKey,
      },
    };
  }
  const transcript: RrmScenarioResultV2["simulationTranscript"] = [];
  for (let i = 0; i < msgs.length; i += 1) {
    const m = msgs[i];
    const pb = `${base}.simulationTranscript[${i}]`;
    if (typeof m !== "object" || m === null) {
      return {
        ok: false,
        failure: "schema",
        detail: {
          path: pb,
          reason: "expected_object",
          expectedShape: "simulationTranscript item must be { speaker: viewer|candidate, message: string }",
          offendingType: offendingTypeOfValue(m),
          normalizationAttempted: true,
        },
      };
    }
    const mo = m as Record<string, unknown>;
    if (mo.speaker !== "viewer" && mo.speaker !== "candidate") {
      return { ok: false, failure: "schema", detail: { path: `${pb}.speaker`, reason: "expected_viewer_or_candidate" } };
    }
    const text = mo.message;
    if (typeof text !== "string" || text.trim().length === 0 || text.length > MSG_LEN_MAX) {
      return {
        ok: false,
        failure: "schema",
        detail: { path: `${pb}.message`, reason: "expected_message_nonempty_max_160" },
      };
    }
    transcript.push({ speaker: mo.speaker, message: text.trim() });
  }

  const summary = o.simulationSummary;
  if (typeof summary !== "string" || summary.trim().length === 0 || summary.length > SUMMARY_MAX) {
    return { ok: false, failure: "schema", detail: { path: `${base}.simulationSummary`, reason: "expected_summary" } };
  }
  let observerNotes: string | undefined;
  if (o.observerNotes !== undefined) {
    if (typeof o.observerNotes !== "string" || o.observerNotes.length > SUMMARY_MAX) {
      return { ok: false, failure: "schema", detail: { path: `${base}.observerNotes`, reason: "expected_optional_string" } };
    }
    observerNotes = o.observerNotes.trim() || undefined;
  }

  const sig = validateSignals(o.signals, `${base}.signals`);
  if (!sig.ok) return sig;

  const ev = o.evaluator;
  if (typeof ev !== "object" || ev === null) {
    return { ok: false, failure: "schema", detail: { path: `${base}.evaluator`, reason: "expected_object" } };
  }
  const evo = ev as Record<string, unknown>;
  const sc = normalize01(evo.scenarioScore);
  const cf = normalize01(evo.confidence);
  if (sc === null || sc < 0 || sc > 1) {
    return { ok: false, failure: "schema", detail: { path: `${base}.evaluator.scenarioScore`, reason: "expected_0_1" } };
  }
  if (cf === null || cf < 0 || cf > 1) {
    return { ok: false, failure: "schema", detail: { path: `${base}.evaluator.confidence`, reason: "expected_0_1" } };
  }
  const scenarioScore = Math.round(sc * 10_000) / 10_000;
  const conf = Math.round(cf * 10_000) / 10_000;

  return {
    ok: true,
    row: {
      scenario: expectedKey,
      scenarioApproachIntensity: Math.round(intensity * 1000) / 1000,
      simulationTranscript: transcript,
      simulationSummary: summary.trim(),
      ...(observerNotes ? { observerNotes } : {}),
      signals: sig.row,
      evaluator: { scenarioScore, confidence: conf },
    },
  };
}

function validateOverall(
  o: unknown,
): { ok: true; row: RrmOverallSimulationAssessmentV2 } | { ok: false; failure: "schema"; detail: AiSimulationV2SchemaFailureDetail } {
  const base = "overallSimulationAssessment";
  if (typeof o !== "object" || o === null) {
    return { ok: false, failure: "schema", detail: { path: base, reason: "expected_object" } };
  }
  const r = o as Record<string, unknown>;
  if (!isNonEmptyShortString(r.crossScenarioConsistency, 600)) {
    return {
      ok: false,
      failure: "schema",
      detail: { path: `${base}.crossScenarioConsistency`, reason: "expected_nonempty_string" },
    };
  }
  if (!Array.isArray(r.mainStrengths)) {
    return { ok: false, failure: "schema", detail: { path: `${base}.mainStrengths`, reason: "expected_array" } };
  }
  if (!Array.isArray(r.mainRisks)) {
    return { ok: false, failure: "schema", detail: { path: `${base}.mainRisks`, reason: "expected_array" } };
  }
  if (r.mainStrengths.length > MAIN_LIST_MAX_ITEMS || r.mainRisks.length > MAIN_LIST_MAX_ITEMS) {
    return { ok: false, failure: "schema", detail: { path: base, reason: "main_list_too_long" } };
  }
  const strengths: string[] = [];
  for (let i = 0; i < r.mainStrengths.length; i += 1) {
    const s = r.mainStrengths[i];
    if (typeof s !== "string" || s.trim().length === 0 || s.length > OVERALL_LINE_MAX) {
      return {
        ok: false,
        failure: "schema",
        detail: { path: `${base}.mainStrengths[${i}]`, reason: "expected_nonempty_line" },
      };
    }
    strengths.push(s.trim());
  }
  const risks: string[] = [];
  for (let i = 0; i < r.mainRisks.length; i += 1) {
    const s = r.mainRisks[i];
    if (typeof s !== "string" || s.trim().length === 0 || s.length > OVERALL_LINE_MAX) {
      return {
        ok: false,
        failure: "schema",
        detail: { path: `${base}.mainRisks[${i}]`, reason: "expected_nonempty_line" },
      };
    }
    risks.push(s.trim());
  }
  if (strengths.length === 0 || risks.length === 0) {
    return { ok: false, failure: "schema", detail: { path: base, reason: "strengths_risks_min1" } };
  }
  if (!isNonEmptyShortString(r.recommendedOpeningStyle, 220)) {
    return {
      ok: false,
      failure: "schema",
      detail: { path: `${base}.recommendedOpeningStyle`, reason: "expected_nonempty_string" },
    };
  }
  const oc = normalize01(r.confidence);
  if (oc === null || oc < 0 || oc > 1) {
    return { ok: false, failure: "schema", detail: { path: `${base}.confidence`, reason: "expected_0_1" } };
  }
  return {
    ok: true,
    row: {
      crossScenarioConsistency: r.crossScenarioConsistency.trim(),
      mainStrengths: strengths,
      mainRisks: risks,
      recommendedOpeningStyle: r.recommendedOpeningStyle.trim(),
      confidence: Math.round(oc * 10_000) / 10_000,
    },
  };
}

export function parseAndValidateAiSimulationLlmPayloadV2(rawText: string): ParseValidateAiSimulationLlmPayloadV2Result {
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
  const sv = root.schemaVersion;
  const v2 =
    sv === AI_SIMULATION_LLM_PAYLOAD_SCHEMA_V2 ||
    sv === "ai_simulation_llm_payload_v2" ||
    sv === "2" ||
    Number(sv) === AI_SIMULATION_LLM_PAYLOAD_SCHEMA_V2;
  if (!v2) {
    return schema({ path: "schemaVersion", reason: "expected_v2_literal" });
  }

  const st = root.sourceType;
  if (typeof st !== "string" || st.trim().length === 0) {
    return schema({ path: "sourceType", reason: "expected_nonempty_string" });
  }
  const srcv = root.sourceVersion;
  if (typeof srcv !== "string" || srcv.trim().length === 0) {
    return schema({ path: "sourceVersion", reason: "expected_nonempty_string" });
  }
  if (typeof root.fallbackUsed !== "boolean") {
    return schema({ path: "fallbackUsed", reason: "expected_boolean" });
  }

  const part = root.participants;
  if (typeof part !== "object" || part === null) {
    return schema({ path: "participants", reason: "expected_object" });
  }
  const po = part as Record<string, unknown>;
  if (typeof po.viewerUserId !== "string" || po.viewerUserId.trim() === "") {
    return schema({ path: "participants.viewerUserId", reason: "expected_string" });
  }
  if (typeof po.candidateUserId !== "string" || po.candidateUserId.trim() === "") {
    return schema({ path: "participants.candidateUserId", reason: "expected_string" });
  }

  const sr = root.scenarioResults;
  if (!Array.isArray(sr)) {
    return schema({ path: "scenarioResults", reason: "expected_array" });
  }
  if (sr.length !== RRM_SCENARIO_KEYS_ORDERED.length) {
    return schema({
      path: "scenarioResults",
      reason: `expected_length_${RRM_SCENARIO_KEYS_ORDERED.length}_fixed_order`,
    });
  }

  normalizeAiSimulationV2PayloadScenarioTranscripts(root);

  const scenarios: RrmScenarioResultV2[] = [];
  for (let i = 0; i < RRM_SCENARIO_KEYS_ORDERED.length; i += 1) {
    const vr = validateScenario(sr[i], i, RRM_SCENARIO_KEYS_ORDERED[i]);
    if (!vr.ok) return vr;
    scenarios.push(vr.row);
  }

  const ov = validateOverall(root.overallSimulationAssessment);
  if (!ov.ok) return ov;

  if (srcv.trim() !== AI_SIMULATION_RRM_SOURCE_VERSION) {
    return schema({
      path: "sourceVersion",
      reason: "expected_rrm_ready_v2_source_version",
    });
  }

  const payload: AiSimulationLlmPayloadV2 = {
    schemaVersion: AI_SIMULATION_LLM_PAYLOAD_SCHEMA_V2,
    sourceType: st.trim(),
    sourceVersion: srcv.trim(),
    fallbackUsed: root.fallbackUsed,
    participants: {
      viewerUserId: po.viewerUserId.trim(),
      candidateUserId: po.candidateUserId.trim(),
    },
    scenarioResults: scenarios,
    overallSimulationAssessment: ov.row,
  };
  return { ok: true, payload };
}
