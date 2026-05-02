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

/** M15D/M15F + M4.2-F2: unit scalar in [0,1], including plain numeric strings (trim, no 0–100 scaling). */
function tryExtractUnitScalar01(raw: unknown): number | undefined {
  const x = extractUnitScalar(raw);
  if (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1) {
    return x;
  }
  if (typeof x === "string") {
    const t = x.trim();
    if (t === "") return undefined;
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0 && n <= 1) {
      return n;
    }
  }
  return undefined;
}

/** M3.8-M15H + M4.2-F2: 0–1 decisionConfidence including numeric strings and nested confidence. */
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
    isPlainObject(pairwiseDecision) ? pairwiseDecision.decisionConfidence : undefined,
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

/** M4.2-F2: copy missing per-candidate six-axis scalars from root `dimensions` when present (unit coercion). */
function hoistRootDimensionsOntoMissingCandidateAxes(draft: Record<string, unknown>): void {
  const rootDims = draft.dimensions;
  if (!isPlainObject(rootDims)) return;
  for (const ck of ["candidateA", "candidateB"] as const) {
    const block = draft[ck];
    if (!isPlainObject(block)) continue;
    const b = { ...block };
    for (const field of RRM_LITE_PAIRWISE_DIM_KEYS) {
      if (!isCandidateDimScalarMissing(b, field)) continue;
      if (!(field in rootDims)) continue;
      const unit = tryExtractUnitScalar01(rootDims[field]);
      if (unit !== undefined) {
        b[field] = unit;
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
        const s01 = tryExtractUnitScalar01(orig);
        if (s01 !== undefined) {
          b[k] = s01;
          continue;
        }
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
 * M3.8-M15E + M4.2-F2: boolean literals for `candidateA.strongRisk` / `candidateB.strongRisk`;
 * strings "true"/"false" and numbers 0/1.
 */
function coerceStrongRiskLiteral(raw: unknown): unknown {
  if (raw === undefined || raw === null) {
    return raw;
  }
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw === 0) return false;
    if (raw === 1) return true;
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
    if (typeof v === "number" && Number.isFinite(v)) {
      if (v === 0) return false;
      if (v === 1) return true;
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

/** M4.2-F2: case / hyphen tolerant suggestedAction (safe subset only). */
function canonicalSuggestedActionString(raw: string): string | undefined {
  const t = raw.trim().toLowerCase().replace(/-/g, "_");
  if (SUGGESTED_ACTION_ENUM_SET.has(t)) return t;
  if (t === "slowdown") return "slow_down";
  return undefined;
}

function normalizeCandidateNestedEnumsOntoTopLevel(draft: Record<string, unknown>): void {
  const hoistSuggestedAction = (b: Record<string, unknown>): unknown[] => [
    isPlainObject(b.action) ? b.action.suggestedAction : undefined,
    isPlainObject(b.action) ? b.action.value : undefined,
    isPlainObject(b.recommendation) ? b.recommendation.suggestedAction : undefined,
    isPlainObject(b.recommendation) ? b.recommendation.value : undefined,
    isPlainObject(b.guidance) ? b.guidance.suggestedAction : undefined,
    isPlainObject(b.guidance) ? b.guidance.value : undefined,
    isPlainObject(b.decision) ? b.decision.suggestedAction : undefined,
    isPlainObject(b.candidate) ? b.candidate.suggestedAction : undefined,
    isPlainObject(b.profile) ? b.profile.suggestedAction : undefined,
    isPlainObject(b.dimensions) ? b.dimensions.suggestedAction : undefined,
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
      let lit = extractLiteralEnum(cur, allowed);
      if (lit === undefined && field === "suggestedAction" && typeof cur === "string") {
        const c = canonicalSuggestedActionString(cur);
        if (c !== undefined && allowed.has(c)) lit = c;
      }
      if (lit !== undefined) {
        b[field] = lit;
      }
      return;
    }
    for (const raw of hoisted) {
      let lit = extractLiteralEnum(raw, allowed);
      if (lit === undefined && field === "suggestedAction" && typeof raw === "string") {
        const c = canonicalSuggestedActionString(raw);
        if (c !== undefined && allowed.has(c)) lit = c;
      }
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

/** M4.2-F2: authoritative viewer/pool/candidate ids from shortlist (ignore LLM echo). */
function applyAuthoritativeBindingMetadata(
  draft: Record<string, unknown>,
  shortlist: RelationshipShortlistTop2,
): void {
  draft.viewerUserId = shortlist.viewerUserId;
  draft.poolId = shortlist.poolId;
  draft.candidateAUserId = shortlist.candidates[0].candidateUserId;
  draft.candidateBUserId = shortlist.candidates[1].candidateUserId;
}

/** M4.2-F2: root `fallbackUsed` — boolean, or string/number literals commonly emitted by LLMs. */
function normalizeFallbackUsedInDraft(draft: Record<string, unknown>): void {
  const v = draft.fallbackUsed;
  if (v === undefined || v === null) return;
  if (typeof v === "boolean") {
    draft.fallbackUsed = v;
    return;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v === 0) draft.fallbackUsed = false;
    else if (v === 1) draft.fallbackUsed = true;
    return;
  }
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "1" || t === "yes") draft.fallbackUsed = true;
    else if (t === "false" || t === "0" || t === "no") draft.fallbackUsed = false;
  }
}

/**
 * M3.8-M15A + M15B + M15C + M15D + **M4.2-F2**: after `JSON.parse`, before `parseAndValidateAiPairwiseDecision`.
 * **M4.2-F2**: `viewerUserId`, `poolId`, `candidateAUserId`, `candidateBUserId` are **always** taken from the active shortlist
 * (LLM echoes ignored for those four fields).
 * tolerate safe metadata literal variants (schemaVersion, string "false" for applied flags);
 * **authoritative** `sourceVersion` is always written from `AI_PAIRWISE_DECISION_SOURCE_VERSION` (LLM value ignored);
 * **M15D + F2**: `extractUnitScalar` / **`tryExtractUnitScalar01`** on `dimensions.*` and `candidateA|B` six axis fields —
 * unwrap `{score|value|rating}`; **F2** adds plain **numeric strings** in [0,1]; no 0–100 scaling, no invented defaults.
 * **M15E + F2**: `strongRisk` — boolean, `"true"`/`"false"`, **`0`/`1`**, or `{ value: ... }` per `coerceStrongRiskLiteral`.
 * **M15F + F2**: nested `scores|dimensions|fit|metrics|ratings` on candidates; **F2** also hoists missing axes from **root**
 * `draft.dimensions` when present.
 * **M15G + F2**: **`suggestedAction`** / **`progressionWindow`** — strict enums + extra nested hoists; **F2** canonicalizes
 * common `suggestedAction` string variants (case, hyphen).
 * **M15H + F2**: root **`decisionConfidence`** — unwrap + hoists; **F2** accepts **numeric strings** in [0,1] via `tryExtractUnitScalar01`.
 * **F2**: root **`fallbackUsed`** — boolean coercion for string `"true"`/`"false"` and `0`/`1`.
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
  const nowIso = new Date().toISOString();

  applyAuthoritativeBindingMetadata(draft, shortlist);

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
  hoistRootDimensionsOntoMissingCandidateAxes(draft);
  normalizeRrmLiteDimensionLayersInDraft(draft);
  normalizeStrongRiskInCandidateBlocks(draft);
  normalizeCandidateNestedEnumsOntoTopLevel(draft);
  normalizeDecisionConfidenceInDraft(draft);
  normalizeFallbackUsedInDraft(draft);

  return { ok: true, draft };
}
