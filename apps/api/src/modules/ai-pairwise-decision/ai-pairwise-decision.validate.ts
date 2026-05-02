import {
  AI_PAIRWISE_DECISION_SCHEMA_VERSION,
  AI_PAIRWISE_DECISION_SOURCE_VERSION,
  PROGRESSION_WINDOW_VALUES,
  RELATIONSHIP_SHORTLIST_TOP2_SCHEMA_VERSION,
  RELATIONSHIP_SHORTLIST_TOP2_SOURCE_VERSION,
  SUGGESTED_ACTION_VALUES,
} from "./ai-pairwise-decision.schema";
import type {
  AiPairwiseDecision,
  AiPairwiseDecisionCandidateBlock,
  AiPairwiseDecisionDimensions,
  AiPairwiseDecisionSchemaFailureDetail,
  AxisScoresSummary,
  ParseValidateAiPairwiseDecisionResult,
  ParseValidateRelationshipShortlistTop2Result,
  RelationshipShortlistTop2,
  RelationshipShortlistTop2Candidate,
} from "./ai-pairwise-decision.types";

function fail(
  path: string,
  reason: string,
  expected?: string,
  actual?: string,
): { ok: false; failureDetail: AiPairwiseDecisionSchemaFailureDetail } {
  return { ok: false, failureDetail: { path, reason, expected, actual } };
}

function isValidatorFailure(x: unknown): x is { ok: false; failureDetail: AiPairwiseDecisionSchemaFailureDetail } {
  return typeof x === "object" && x !== null && (x as { ok?: unknown }).ok === false && "failureDetail" in x;
}

function unwrapJsonInput(
  input: unknown,
):
  | { ok: true; value: unknown }
  | { ok: false; failureDetail: AiPairwiseDecisionSchemaFailureDetail } {
  if (typeof input === "string") {
    try {
      return { ok: true, value: JSON.parse(input) as unknown };
    } catch {
      return fail("input", "json_parse_error", "valid JSON object string");
    }
  }
  return { ok: true, value: input };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isNumberInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateAxisScoresSummary(raw: unknown, path: string): AxisScoresSummary | ReturnType<typeof fail> {
  if (!isPlainObject(raw)) {
    return fail(path, "expected_plain_object", "non-array object", Array.isArray(raw) ? "array" : typeof raw);
  }
  const out: AxisScoresSummary = {};
  for (const [k, val] of Object.entries(raw)) {
    if (!isNonEmptyString(k)) {
      return fail(`${path}.${k}`, "expected_axis_key_nonempty_string");
    }
    if (!isNumberInRange(val, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)) {
      return fail(`${path}.${k}`, "expected_finite_number", "number", typeof val);
    }
    out[k] = val as number;
  }
  return out;
}

function validateRelationshipShortlistTop2Candidate(
  raw: unknown,
  basePath: string,
  expectedStaticRank: 1 | 2,
): RelationshipShortlistTop2Candidate | ReturnType<typeof fail> {
  if (!isPlainObject(raw)) {
    return fail(basePath, "expected_object");
  }
  const o = raw;
  const candidateUserId = o.candidateUserId;
  if (!isNonEmptyString(candidateUserId)) {
    return fail(`${basePath}.candidateUserId`, "expected_nonempty_string");
  }
  const staticRank = o.staticRank;
  if (staticRank !== expectedStaticRank) {
    return fail(
      `${basePath}.staticRank`,
      "expected_static_rank_order",
      String(expectedStaticRank),
      String(staticRank),
    );
  }
  const score = o.staticCompatibilityScore;
  if (!isNumberInRange(score, 0, 100)) {
    return fail(
      `${basePath}.staticCompatibilityScore`,
      "expected_range_0_100",
      "[0,100]",
      typeof score === "number" && Number.isFinite(score) ? String(score) : String(score),
    );
  }
  const axis = validateAxisScoresSummary(o.axisScoresSummary, `${basePath}.axisScoresSummary`);
  if (isValidatorFailure(axis)) return axis;

  const strengths = o.majorStrengths;
  if (!Array.isArray(strengths) || !strengths.every((s) => typeof s === "string")) {
    return fail(`${basePath}.majorStrengths`, "expected_string_array");
  }
  const risks = o.majorRisks;
  if (!Array.isArray(risks) || !risks.every((s) => typeof s === "string")) {
    return fail(`${basePath}.majorRisks`, "expected_string_array");
  }
  if (o.dealbreakerPassed !== true) {
    return fail(
      `${basePath}.dealbreakerPassed`,
      "must_be_true",
      "true",
      String(o.dealbreakerPassed),
    );
  }
  if (o.visualPoolRank !== undefined && o.visualPoolRank !== null) {
    if (typeof o.visualPoolRank !== "number" || !Number.isFinite(o.visualPoolRank) || o.visualPoolRank < 1) {
      return fail(`${basePath}.visualPoolRank`, "expected_positive_finite_number_or_omit");
    }
  }
  const reasonSummary = o.reasonSummary;
  if (!isNonEmptyString(reasonSummary)) {
    return fail(`${basePath}.reasonSummary`, "expected_nonempty_string");
  }

  const candidate: RelationshipShortlistTop2Candidate = {
    candidateUserId,
    staticRank: expectedStaticRank,
    staticCompatibilityScore: score,
    axisScoresSummary: axis as AxisScoresSummary,
    majorStrengths: strengths as string[],
    majorRisks: risks as string[],
    dealbreakerPassed: true,
    ...(o.visualPoolRank !== undefined && o.visualPoolRank !== null ? { visualPoolRank: o.visualPoolRank as number } : {}),
    reasonSummary,
  };
  return candidate;
}

/**
 * Validates frozen **RelationshipShortlistTop2** contract (exactly 2 candidates, static ranks 1 then 2, dealbreaker true).
 */
export function parseAndValidateRelationshipShortlistTop2(
  input: unknown,
): ParseValidateRelationshipShortlistTop2Result {
  const unwrapped = unwrapJsonInput(input);
  if (!unwrapped.ok) return unwrapped;
  const root = unwrapped.value;
  if (!isPlainObject(root)) {
    return fail("root", "expected_object");
  }
  if (root.schemaVersion !== RELATIONSHIP_SHORTLIST_TOP2_SCHEMA_VERSION) {
    return fail("schemaVersion", "expected_literal", String(RELATIONSHIP_SHORTLIST_TOP2_SCHEMA_VERSION), String(root.schemaVersion));
  }
  if (root.sourceVersion !== RELATIONSHIP_SHORTLIST_TOP2_SOURCE_VERSION) {
    return fail(
      "sourceVersion",
      "expected_literal",
      RELATIONSHIP_SHORTLIST_TOP2_SOURCE_VERSION,
      String(root.sourceVersion),
    );
  }
  if (!isNonEmptyString(root.viewerUserId)) {
    return fail("viewerUserId", "expected_nonempty_string");
  }
  if (!isNonEmptyString(root.poolId)) {
    return fail("poolId", "expected_nonempty_string");
  }
  if (root.shortlistFingerprint !== undefined && typeof root.shortlistFingerprint !== "string") {
    return fail("shortlistFingerprint", "expected_string_or_omit");
  }
  if (!isNonEmptyString(root.generatedAt)) {
    return fail("generatedAt", "expected_nonempty_string");
  }

  const candidates = root.candidates;
  if (!Array.isArray(candidates)) {
    return fail("candidates", "expected_array");
  }
  if (candidates.length !== 2) {
    return fail(
      "candidates",
      "expected_length_2",
      "2",
      String(candidates.length),
    );
  }

  const c0 = validateRelationshipShortlistTop2Candidate(candidates[0], "candidates[0]", 1);
  if (isValidatorFailure(c0)) return c0;

  const c1 = validateRelationshipShortlistTop2Candidate(candidates[1], "candidates[1]", 2);
  if (isValidatorFailure(c1)) return c1;

  const a = c0 as RelationshipShortlistTop2Candidate;
  const b = c1 as RelationshipShortlistTop2Candidate;
  if (a.candidateUserId === b.candidateUserId) {
    return fail("candidates", "duplicate_candidateUserId", "distinct ids", a.candidateUserId);
  }

  const value: RelationshipShortlistTop2 = {
    schemaVersion: 1,
    sourceVersion: RELATIONSHIP_SHORTLIST_TOP2_SOURCE_VERSION,
    viewerUserId: root.viewerUserId,
    poolId: root.poolId,
    ...(root.shortlistFingerprint !== undefined ? { shortlistFingerprint: root.shortlistFingerprint } : {}),
    candidates: [a, b],
    generatedAt: root.generatedAt,
  };
  return { ok: true, value };
}

function validateDim01(raw: unknown, path: string): number | ReturnType<typeof fail> {
  if (!isNumberInRange(raw, 0, 1)) {
    return fail(path, "expected_range_0_1", "[0,1]", typeof raw === "number" && Number.isFinite(raw) ? String(raw) : String(raw));
  }
  return raw;
}

function validateCandidateBlock(raw: unknown, path: string): AiPairwiseDecisionCandidateBlock | ReturnType<typeof fail> {
  if (!isPlainObject(raw)) {
    return fail(path, "expected_object");
  }
  const keys = ["conversationFit", "emotionalSafety", "conflictRepair", "progressionFit", "longTermFit", "riskControl"] as const;
  const nums: Partial<Record<(typeof keys)[number], number>> = {};
  for (const k of keys) {
    const v = validateDim01(raw[k], `${path}.${k}`);
    if (isValidatorFailure(v)) return v;
    nums[k] = v as number;
  }
  if (typeof raw.strongRisk !== "boolean") {
    return fail(`${path}.strongRisk`, "expected_boolean");
  }
  const sa = raw.suggestedAction;
  if (!SUGGESTED_ACTION_VALUES.includes(sa as (typeof SUGGESTED_ACTION_VALUES)[number])) {
    return fail(
      `${path}.suggestedAction`,
      "expected_enum",
      SUGGESTED_ACTION_VALUES.join("|"),
      String(sa),
    );
  }
  const pw = raw.progressionWindow;
  if (!PROGRESSION_WINDOW_VALUES.includes(pw as (typeof PROGRESSION_WINDOW_VALUES)[number])) {
    return fail(
      `${path}.progressionWindow`,
      "expected_enum",
      PROGRESSION_WINDOW_VALUES.join("|"),
      String(pw),
    );
  }
  if (!isNonEmptyString(raw.reasonSummary)) {
    return fail(`${path}.reasonSummary`, "expected_nonempty_string");
  }
  return {
    conversationFit: nums.conversationFit!,
    emotionalSafety: nums.emotionalSafety!,
    conflictRepair: nums.conflictRepair!,
    progressionFit: nums.progressionFit!,
    longTermFit: nums.longTermFit!,
    riskControl: nums.riskControl!,
    strongRisk: raw.strongRisk,
    suggestedAction: sa as AiPairwiseDecisionCandidateBlock["suggestedAction"],
    progressionWindow: pw as AiPairwiseDecisionCandidateBlock["progressionWindow"],
    reasonSummary: raw.reasonSummary,
  };
}

function validateDimensions(raw: unknown, path: string): AiPairwiseDecisionDimensions | ReturnType<typeof fail> {
  if (!isPlainObject(raw)) {
    return fail(path, "expected_object");
  }
  const keys = ["conversationFit", "emotionalSafety", "conflictRepair", "progressionFit", "longTermFit", "riskControl"] as const;
  const out: Partial<AiPairwiseDecisionDimensions> = {};
  for (const k of keys) {
    const v = validateDim01(raw[k], `${path}.${k}`);
    if (isValidatorFailure(v)) return v;
    out[k] = v as number;
  }
  return out as AiPairwiseDecisionDimensions;
}

/**
 * Validates frozen **AiPairwiseDecision** (RRM-lite) contract; does not call LLM or persist.
 */
export function parseAndValidateAiPairwiseDecision(input: unknown): ParseValidateAiPairwiseDecisionResult {
  const unwrapped = unwrapJsonInput(input);
  if (!unwrapped.ok) return unwrapped;
  const root = unwrapped.value;
  if (!isPlainObject(root)) {
    return fail("root", "expected_object");
  }
  if (root.schemaVersion !== AI_PAIRWISE_DECISION_SCHEMA_VERSION) {
    return fail("schemaVersion", "expected_literal", String(AI_PAIRWISE_DECISION_SCHEMA_VERSION), String(root.schemaVersion));
  }
  if (root.sourceVersion !== AI_PAIRWISE_DECISION_SOURCE_VERSION) {
    return fail(
      "sourceVersion",
      "expected_literal",
      AI_PAIRWISE_DECISION_SOURCE_VERSION,
      String(root.sourceVersion),
    );
  }
  if (!isNonEmptyString(root.viewerUserId)) return fail("viewerUserId", "expected_nonempty_string");
  if (!isNonEmptyString(root.poolId)) return fail("poolId", "expected_nonempty_string");
  if (!isNonEmptyString(root.candidateAUserId)) return fail("candidateAUserId", "expected_nonempty_string");
  if (!isNonEmptyString(root.candidateBUserId)) return fail("candidateBUserId", "expected_nonempty_string");
  if (!isNonEmptyString(root.winnerCandidateId)) return fail("winnerCandidateId", "expected_nonempty_string");
  if (!isNonEmptyString(root.loserCandidateId)) return fail("loserCandidateId", "expected_nonempty_string");
  if (!isNonEmptyString(root.generatedAt)) return fail("generatedAt", "expected_nonempty_string");

  const viewerUserId = root.viewerUserId;
  const poolId = root.poolId;
  const aId = root.candidateAUserId;
  const bId = root.candidateBUserId;
  const winner = root.winnerCandidateId;
  const loser = root.loserCandidateId;
  const generatedAt = root.generatedAt;
  if (aId === bId) {
    return fail("candidateBUserId", "must_differ_from_candidateA");
  }
  if (winner !== aId && winner !== bId) {
    return fail("winnerCandidateId", "must_equal_A_or_B", `${aId}|${bId}`, String(winner));
  }
  if (loser !== aId && loser !== bId) {
    return fail("loserCandidateId", "must_equal_A_or_B", `${aId}|${bId}`, String(loser));
  }
  if (winner === loser) {
    return fail("loserCandidateId", "must_differ_from_winner");
  }

  if (!isNumberInRange(root.decisionConfidence, 0, 1)) {
    return fail(
      "decisionConfidence",
      "expected_range_0_1",
      "[0,1]",
      String(root.decisionConfidence),
    );
  }
  const decisionConfidence = root.decisionConfidence;
  if (!isNumberInRange(root.decisionScoreA, 0, 100)) {
    return fail("decisionScoreA", "expected_range_0_100", "[0,100]", String(root.decisionScoreA));
  }
  if (!isNumberInRange(root.decisionScoreB, 0, 100)) {
    return fail("decisionScoreB", "expected_range_0_100", "[0,100]", String(root.decisionScoreB));
  }
  const decisionScoreA = root.decisionScoreA;
  const decisionScoreB = root.decisionScoreB;

  const dims = validateDimensions(root.dimensions, "dimensions");
  if (isValidatorFailure(dims)) return dims;

  const blockA = validateCandidateBlock(root.candidateA, "candidateA");
  if (isValidatorFailure(blockA)) return blockA;
  const blockB = validateCandidateBlock(root.candidateB, "candidateB");
  if (isValidatorFailure(blockB)) return blockB;

  if (!isNonEmptyString(root.decisionReason)) {
    return fail("decisionReason", "expected_nonempty_string");
  }
  const decisionReason = root.decisionReason;
  if (typeof root.fallbackUsed !== "boolean") {
    return fail("fallbackUsed", "expected_boolean");
  }
  const fallbackUsed = root.fallbackUsed;
  if (root.appliedToFinalScore !== false) {
    return fail(
      "appliedToFinalScore",
      "must_be_false",
      "false",
      String(root.appliedToFinalScore),
    );
  }
  if (root.appliedToWorkerRanking !== false) {
    return fail(
      "appliedToWorkerRanking",
      "must_be_false",
      "false",
      String(root.appliedToWorkerRanking),
    );
  }

  const value: AiPairwiseDecision = {
    schemaVersion: 1,
    sourceVersion: AI_PAIRWISE_DECISION_SOURCE_VERSION,
    viewerUserId,
    poolId,
    candidateAUserId: aId,
    candidateBUserId: bId,
    winnerCandidateId: winner,
    loserCandidateId: loser,
    decisionConfidence,
    decisionScoreA,
    decisionScoreB,
    dimensions: dims as AiPairwiseDecisionDimensions,
    candidateA: blockA as AiPairwiseDecisionCandidateBlock,
    candidateB: blockB as AiPairwiseDecisionCandidateBlock,
    decisionReason,
    fallbackUsed,
    appliedToFinalScore: false,
    appliedToWorkerRanking: false,
    generatedAt,
  };
  return { ok: true, value };
}
