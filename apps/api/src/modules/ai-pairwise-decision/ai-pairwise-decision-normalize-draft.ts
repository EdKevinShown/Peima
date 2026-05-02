import {
  AI_PAIRWISE_DECISION_SCHEMA_VERSION,
  AI_PAIRWISE_DECISION_SOURCE_VERSION,
  PROGRESSION_WINDOW_VALUES,
  SUGGESTED_ACTION_VALUES,
} from "./ai-pairwise-decision.schema";
import type { RelationshipShortlistTop2 } from "./ai-pairwise-decision.types";

export type NormalizeAiPairwiseDecisionDraftFailureCode = "binding_conflict" | "metadata_conflict";

export type NormalizeAiPairwiseDecisionDraftFailure = {
  code: NormalizeAiPairwiseDecisionDraftFailureCode;
  path: string;
  reason: string;
  message: string;
  expected?: string;
  actual?: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isEmptyBindingString(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/** M3.8-M15B: tolerate common LLM literals for schemaVersion; output is always numeric `1` for the validator. */
function normalizeSchemaVersionMetadata(
  sv: unknown,
): { ok: true; value: typeof AI_PAIRWISE_DECISION_SCHEMA_VERSION } | { ok: false; actual: string } {
  if (sv === undefined || sv === null || (typeof sv === "string" && sv.trim() === "")) {
    return { ok: true, value: AI_PAIRWISE_DECISION_SCHEMA_VERSION };
  }
  if (typeof sv === "boolean" || typeof sv === "object") {
    return { ok: false, actual: String(sv).slice(0, 50) };
  }
  if (typeof sv === "number") {
    if (!Number.isFinite(sv) || sv !== AI_PAIRWISE_DECISION_SCHEMA_VERSION) {
      return { ok: false, actual: String(sv).slice(0, 50) };
    }
    return { ok: true, value: AI_PAIRWISE_DECISION_SCHEMA_VERSION };
  }
  if (typeof sv === "string") {
    const t = sv.trim();
    const n = Number(t);
    if (Number.isFinite(n) && n === AI_PAIRWISE_DECISION_SCHEMA_VERSION) {
      return { ok: true, value: AI_PAIRWISE_DECISION_SCHEMA_VERSION };
    }
    return { ok: false, actual: t.slice(0, 50) };
  }
  return { ok: false, actual: String(sv).slice(0, 50) };
}

const RRM_LITE_PAIRWISE_DIM_KEYS = [
  "conversationFit",
  "emotionalSafety",
  "conflictRepair",
  "progressionFit",
  "longTermFit",
  "riskControl",
] as const;

const SUGGESTED_ACTION_ENUM_SET = new Set<string>(SUGGESTED_ACTION_VALUES);
const PROGRESSION_WINDOW_ENUM_SET = new Set<string>(PROGRESSION_WINDOW_VALUES);

/**
 * M3.8-M15D: safe unit scalar for RRM-lite 0–1 axes only.
 * - Plain number in [0,1]: kept.
 * - Plain object (not array): take first present among `score` → `value` → `rating` **only if** that property is a
 *   **finite number** in [0,1] (no string parse, no 0–100 scaling, no default fill).
 * - Strings, arrays, ambiguous objects: unchanged → validator fails as before.
 */
function extractUnitScalar(raw: unknown): unknown {
  if (raw === undefined || raw === null) {
    return raw;
  }
  if (typeof raw === "number") {
    return raw;
  }
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw;
  }
  if (!isPlainObject(raw)) {
    return raw;
  }

  const pick01 = (obj: Record<string, unknown>, key: string): number | undefined => {
    if (!(key in obj)) return undefined;
    const x = obj[key];
    if (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1) {
      return x;
    }
    return undefined;
  };

  const fromScore = pick01(raw, "score");
  if (fromScore !== undefined) return fromScore;
  const fromValue = pick01(raw, "value");
  if (fromValue !== undefined) return fromValue;
  const fromRating = pick01(raw, "rating");
  if (fromRating !== undefined) return fromRating;

  return raw;
}

/** M15D/M15F: only accept a plain unit scalar when `extractUnitScalar` yields a finite number in [0,1]. */
function tryExtractUnitScalar01(raw: unknown): number | undefined {
  const x = extractUnitScalar(raw);
  if (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1) {
    return x;
  }
  return undefined;
}

/** M3.8-M15H: same 0–1 rules as M15D plus plain `{ confidence: number in [0,1] }` (no string parse, no scaling). */
function tryExtractDecisionConfidence01(raw: unknown): number | undefined {
  const fromUnit = tryExtractUnitScalar01(raw);
  if (fromUnit !== undefined) {
    return fromUnit;
  }
  if (!isPlainObject(raw) || !("confidence" in raw)) {
    return undefined;
  }
  const c = raw.confidence;
  if (typeof c === "number" && Number.isFinite(c) && c >= 0 && c <= 1) {
    return c;
  }
  return tryExtractUnitScalar01(c);
}

function isDecisionConfidenceMissing(draft: Record<string, unknown>): boolean {
  if (!("decisionConfidence" in draft)) return true;
  const v = draft.decisionConfidence;
  return v === undefined || v === null;
}

/** M3.8-M15H: root `decisionConfidence` only — unwrap wrappers; hoist from explicit alternate global keys if missing. */
function normalizeDecisionConfidenceInDraft(draft: Record<string, unknown>): void {
  if (!isDecisionConfidenceMissing(draft)) {
    const s = tryExtractDecisionConfidence01(draft.decisionConfidence);
    if (s !== undefined) {
      draft.decisionConfidence = s;
    }
    return;
  }

  const decision = draft.decision;
  const finalDecision = draft.finalDecision;
  const pairwiseDecision = draft.pairwiseDecision;

  const sources: unknown[] = [
    draft.confidence,
    draft.confidenceScore,
    isPlainObject(decision) ? decision.confidence : undefined,
    isPlainObject(decision) ? decision.decisionConfidence : undefined,
    isPlainObject(finalDecision) ? finalDecision.confidence : undefined,
    isPlainObject(pairwiseDecision) ? pairwiseDecision.confidence : undefined,
  ];

  for (const raw of sources) {
    const s = tryExtractDecisionConfidence01(raw);
    if (s !== undefined) {
      draft.decisionConfidence = s;
      return;
    }
  }
}

/** M3.8-M15F: hoist six axis scores from nested maps on candidateA/B only (never from root `dimensions`). */
const CANDIDATE_DIM_SCALAR_NEST_KEYS = ["scores", "dimensions", "fit", "metrics", "ratings"] as const;

function isCandidateDimScalarMissing(block: Record<string, unknown>, field: (typeof RRM_LITE_PAIRWISE_DIM_KEYS)[number]): boolean {
  if (!(field in block)) return true;
  const v = block[field];
  return v === undefined || v === null;
}

function normalizeCandidateNestedDimScalarsOntoTopLevel(draft: Record<string, unknown>): void {
  for (const ck of ["candidateA", "candidateB"] as const) {
    const block = draft[ck];
    if (!isPlainObject(block)) continue;
    const b = { ...block };
    for (const field of RRM_LITE_PAIRWISE_DIM_KEYS) {
      if (!isCandidateDimScalarMissing(b, field)) continue;
      for (const nestKey of CANDIDATE_DIM_SCALAR_NEST_KEYS) {
        const nest = b[nestKey];
        if (!isPlainObject(nest) || !(field in nest)) continue;
        const unit = tryExtractUnitScalar01(nest[field]);
        if (unit !== undefined) {
          b[field] = unit;
          break;
        }
      }
    }
    draft[ck] = b;
  }
}

function normalizeRrmLiteDimensionLayersInDraft(draft: Record<string, unknown>): void {
  const applyToBlock = (key: "dimensions" | "candidateA" | "candidateB"): void => {
    const block = draft[key];
    if (!isPlainObject(block)) return;
    const b = { ...block };
    for (const k of RRM_LITE_PAIRWISE_DIM_KEYS) {
      if (k in b) {
        const orig = b[k];
        const ex = extractUnitScalar(orig);
        if (typeof ex === "number" && Number.isFinite(ex) && ex >= 0 && ex <= 1) {
          b[k] = ex;
        } else {
          b[k] = orig;
        }
      }
    }
    draft[key] = b;
  };

  applyToBlock("dimensions");
  applyToBlock("candidateA");
  applyToBlock("candidateB");
}

/**
 * M3.8-M15E: strict boolean literals for `candidateA.strongRisk` / `candidateB.strongRisk` only.
 * Does not add missing keys; does not infer from prose or numeric 0/1.
 */
function coerceStrongRiskLiteral(raw: unknown): unknown {
  if (raw === undefined || raw === null) {
    return raw;
  }
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    const t = raw.trim().toLowerCase();
    if (t === "true") return true;
    if (t === "false") return false;
    return raw;
  }
  if (isPlainObject(raw) && "value" in raw) {
    const v = raw.value;
    if (typeof v === "boolean") {
      return v;
    }
    if (typeof v === "string") {
      const t = v.trim().toLowerCase();
      if (t === "true") return true;
      if (t === "false") return false;
    }
    return raw;
  }
  return raw;
}

function normalizeStrongRiskInCandidateBlocks(draft: Record<string, unknown>): void {
  for (const key of ["candidateA", "candidateB"] as const) {
    const block = draft[key];
    if (!isPlainObject(block) || !("strongRisk" in block)) {
      continue;
    }
    const b = { ...block };
    b.strongRisk = coerceStrongRiskLiteral(b.strongRisk);
    draft[key] = b;
  }
}

/**
 * M3.8-M15G: strict contract enum literals only (trim on strings; no case-folding, no fuzzy / i18n mapping).
 * Plain string: accepted only if trim() is in `allowed`.
 * Plain object: only `value`, `enum`, `label` string properties, same rule.
 */
function extractLiteralEnum(value: unknown, allowed: ReadonlySet<string>): string | undefined {
  if (typeof value === "string") {
    const t = value.trim();
    return allowed.has(t) ? t : undefined;
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  for (const k of ["value", "enum", "label"] as const) {
    if (!(k in value)) continue;
    const inner = value[k];
    if (typeof inner !== "string") continue;
    const t = inner.trim();
    if (allowed.has(t)) return t;
  }
  return undefined;
}

function isCandidateEnumFieldMissing(block: Record<string, unknown>, field: "suggestedAction" | "progressionWindow"): boolean {
  if (!(field in block)) return true;
  const v = block[field];
  return v === undefined || v === null;
}

function normalizeCandidateNestedEnumsOntoTopLevel(draft: Record<string, unknown>): void {
  const hoistSuggestedAction = (b: Record<string, unknown>): unknown[] => [
    isPlainObject(b.action) ? b.action.suggestedAction : undefined,
    isPlainObject(b.action) ? b.action.value : undefined,
    isPlainObject(b.recommendation) ? b.recommendation.suggestedAction : undefined,
    isPlainObject(b.recommendation) ? b.recommendation.value : undefined,
    isPlainObject(b.guidance) ? b.guidance.suggestedAction : undefined,
    isPlainObject(b.guidance) ? b.guidance.value : undefined,
  ];

  const hoistProgressionWindow = (b: Record<string, unknown>): unknown[] => [
    isPlainObject(b.window) ? b.window.progressionWindow : undefined,
    isPlainObject(b.window) ? b.window.value : undefined,
    isPlainObject(b.recommendation) ? b.recommendation.progressionWindow : undefined,
    isPlainObject(b.recommendation) ? b.recommendation.window : undefined,
  ];

  const applyEnum = (
    b: Record<string, unknown>,
    field: "suggestedAction" | "progressionWindow",
    allowed: ReadonlySet<string>,
    hoisted: unknown[],
  ): void => {
    const cur = b[field];
    const missing = isCandidateEnumFieldMissing(b, field);
    if (!missing) {
      const lit = extractLiteralEnum(cur, allowed);
      if (lit !== undefined) {
        b[field] = lit;
      }
      return;
    }
    for (const raw of hoisted) {
      const lit = extractLiteralEnum(raw, allowed);
      if (lit !== undefined) {
        b[field] = lit;
        return;
      }
    }
  };

  for (const ck of ["candidateA", "candidateB"] as const) {
    const block = draft[ck];
    if (!isPlainObject(block)) continue;
    const b = { ...block };
    applyEnum(b, "suggestedAction", SUGGESTED_ACTION_ENUM_SET, hoistSuggestedAction(b));
    applyEnum(b, "progressionWindow", PROGRESSION_WINDOW_ENUM_SET, hoistProgressionWindow(b));
    draft[ck] = b;
  }
}

function normalizeAppliedFalseMetadata(
  v: unknown,
  path: "appliedToFinalScore" | "appliedToWorkerRanking",
): { ok: true } | { ok: false; failure: NormalizeAiPairwiseDecisionDraftFailure } {
  if (v === undefined || v === null) {
    return { ok: true };
  }
  if (v === false) {
    return { ok: true };
  }
  if (typeof v === "string" && v.trim().toLowerCase() === "false") {
    return { ok: true };
  }
  if (v === true || (typeof v === "string" && v.trim().toLowerCase() === "true")) {
    return {
      ok: false,
      failure: {
        code: "metadata_conflict",
        path,
        reason: "must_be_false_or_omit",
        message: `${path} must be false, the string "false", or omitted.`,
        expected: "false",
        actual: String(v).slice(0, 50),
      },
    };
  }
  return {
    ok: false,
    failure: {
      code: "metadata_conflict",
      path,
      reason: "must_be_false_or_omit",
      message: `${path} must be false, the string "false", or omitted.`,
      expected: "false",
      actual: typeof v === "string" ? v.slice(0, 50) : String(v).slice(0, 50),
    },
  };
}

/**
 * M3.8-M15A + M15B + M15C + M15D: after `JSON.parse`, before `parseAndValidateAiPairwiseDecision` — fill known binding
 * metadata from the shortlist when omitted; never silently overwrite conflicting binding strings;
 * tolerate safe metadata literal variants (schemaVersion, string "false" for applied flags);
 * **authoritative** `sourceVersion` is always written from `AI_PAIRWISE_DECISION_SOURCE_VERSION` (LLM value ignored);
 * **M15D**: `extractUnitScalar` on `dimensions.*` and `candidateA|B` six axis fields — unwrap `{score|value|rating}` only
 * when those hold a **number** in [0,1]; no string parse, no 0–100 scaling, no invented defaults; if a key exists but cannot
 * yield a unit scalar in [0,1], the original value is kept for the validator.
 * **M15E**: `strongRisk` on **candidateA|B** — boolean, or `"true"`/`"false"` (trim, case-insensitive), or `{ value: boolean | "true"|"false" }`; missing unchanged.
 * **M15F**: on **candidateA|B** only, when a six-axis key is missing, try **in order** `scores`, `dimensions`, `fit`, `metrics`,
 * `ratings` nested objects for the same key; only **`tryExtractUnitScalar01`** (numeric 0–1, same unwrap rules as M15D); never
 * copy from root `draft.dimensions`; no defaults; no 0–100 scaling.
 * **M15G**: **`suggestedAction`** / **`progressionWindow`** on **candidateA|B** — trim + strict match to frozen enums; unwrap
 * `{ value|enum|label }` when those hold an allowed string; when top-level missing, hoist only from listed nested paths inside
 * the same block (never from root draft, no defaults, no fuzzy or natural-language mapping).
 * **M15H**: root **`decisionConfidence`** — **`tryExtractDecisionConfidence01`** (M15D unwrap + **`confidence`** number on
 * objects); if missing, try **`confidence`**, **`confidenceScore`**, **`decision.{confidence|decisionConfidence}`**,
 * **`finalDecision.confidence`**, **`pairwiseDecision.confidence`**; no defaults, no string parse, no 0–100 scaling, no
 * inference from scores or prose.
 */
export function normalizeAiPairwiseDecisionDraftFromShortlist(
  parsed: unknown,
  shortlist: RelationshipShortlistTop2,
): { ok: true; draft: Record<string, unknown> } | { ok: false; failure: NormalizeAiPairwiseDecisionDraftFailure } {
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      failure: {
        code: "metadata_conflict",
        path: "root",
        reason: "expected_plain_object",
        message: "LLM JSON root must be a plain object.",
        expected: "object",
        actual: parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed,
      },
    };
  }

  const draft: Record<string, unknown> = { ...parsed };
  const expectViewer = shortlist.viewerUserId;
  const expectPool = shortlist.poolId;
  const expectA = shortlist.candidates[0].candidateUserId;
  const expectB = shortlist.candidates[1].candidateUserId;
  const nowIso = new Date().toISOString();

  const bindString = (
    key: "viewerUserId" | "poolId" | "candidateAUserId" | "candidateBUserId",
    expected: string,
  ): { ok: true } | { ok: false; failure: NormalizeAiPairwiseDecisionDraftFailure } => {
    const cur = draft[key];
    if (isEmptyBindingString(cur)) {
      draft[key] = expected;
      return { ok: true };
    }
    if (typeof cur !== "string") {
      return {
        ok: false,
        failure: {
          code: "metadata_conflict",
          path: key,
          reason: "expected_string_for_binding_field",
          message: `${key} must be a non-empty string when present.`,
          expected: "non-empty string",
          actual: typeof cur,
        },
      };
    }
    const t = cur.trim();
    if (t !== expected) {
      return {
        ok: false,
        failure: {
          code: "binding_conflict",
          path: key,
          reason: "shortlist_binding_mismatch",
          message: `${key} conflicts with the active shortlist.`,
          expected,
          actual: t.slice(0, 200),
        },
      };
    }
    draft[key] = expected;
    return { ok: true };
  };

  const r1 = bindString("viewerUserId", expectViewer);
  if (!r1.ok) return r1;
  const r2 = bindString("poolId", expectPool);
  if (!r2.ok) return r2;
  const r3 = bindString("candidateAUserId", expectA);
  if (!r3.ok) return r3;
  const r4 = bindString("candidateBUserId", expectB);
  if (!r4.ok) return r4;

  const svNorm = normalizeSchemaVersionMetadata(draft.schemaVersion);
  if (!svNorm.ok) {
    return {
      ok: false,
      failure: {
        code: "metadata_conflict",
        path: "schemaVersion",
        reason: "expected_literal_or_omit",
        message: "schemaVersion must be 1 (number), or an equivalent literal such as \"1\" / \"1.0\", or omitted.",
        expected: String(AI_PAIRWISE_DECISION_SCHEMA_VERSION),
        actual: svNorm.actual,
      },
    };
  }
  draft.schemaVersion = svNorm.value;

  /** M3.8-M15C: contract version is system-owned; model output is never trusted for `sourceVersion`. */
  draft.sourceVersion = AI_PAIRWISE_DECISION_SOURCE_VERSION;

  const afNorm = normalizeAppliedFalseMetadata(draft.appliedToFinalScore, "appliedToFinalScore");
  if (!afNorm.ok) return { ok: false, failure: afNorm.failure };
  draft.appliedToFinalScore = false;

  const awNorm = normalizeAppliedFalseMetadata(draft.appliedToWorkerRanking, "appliedToWorkerRanking");
  if (!awNorm.ok) return { ok: false, failure: awNorm.failure };
  draft.appliedToWorkerRanking = false;

  const ga = draft.generatedAt;
  if (isEmptyBindingString(ga)) {
    draft.generatedAt = nowIso;
  } else if (typeof ga !== "string") {
    return {
      ok: false,
      failure: {
        code: "metadata_conflict",
        path: "generatedAt",
        reason: "expected_string_or_omit",
        message: "generatedAt must be a non-empty string or omitted.",
        expected: "non-empty string",
        actual: typeof ga,
      },
    };
  }

  normalizeCandidateNestedDimScalarsOntoTopLevel(draft);
  normalizeRrmLiteDimensionLayersInDraft(draft);
  normalizeStrongRiskInCandidateBlocks(draft);
  normalizeCandidateNestedEnumsOntoTopLevel(draft);
  normalizeDecisionConfidenceInDraft(draft);

  return { ok: true, draft };
}
