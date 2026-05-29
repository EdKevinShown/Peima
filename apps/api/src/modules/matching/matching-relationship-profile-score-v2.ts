/**
 * M6.0-J4: viewer-safe `relationshipProfileScoreV2` from `matchInsights.scoreShadowV2` (GET `/matching/result`).
 * Does not expose raw questionnaire rows, user ids, or RRM payloads.
 */

export type ViewerSafeRelationshipProfileScoreV2Band =
  | "strong_conflict"
  | "low"
  | "medium"
  | "good"
  | "high"
  | "missing";

/** API envelope: how this object was resolved (not the worker row's `source`). */
export type ViewerSafeRelationshipProfileScoreV2ApiSource =
  | "match_insights_score_shadow_v2"
  | "missing"
  | "invalid";

export type ViewerSafeRelationshipProfileScoreV2 = {
  scoringVersion: string;
  rawCompatibilityScore: number | null;
  weightedBaseScore: number | null;
  penaltyTotal: number | null;
  cappedRawScore: number | null;
  displayScore100: number | null;
  band: ViewerSafeRelationshipProfileScoreV2Band;
  capApplied: number | null;
  coreConflictCount: number | null;
  strongConflictCount: number | null;
  redFlagConflictCount: number | null;
  validAxisCount: number | null;
  skippedAxisCount: number | null;
  source: ViewerSafeRelationshipProfileScoreV2ApiSource;
};

const EXPECTED_SCORING_VERSION = "m6.0-relationship-profile-score-v2-shadow" as const;

const BANDS = new Set<string>([
  "strong_conflict",
  "low",
  "medium",
  "good",
  "high",
]);

const WORKER_ROW_SOURCES = new Set<string>([
  "profile_v2_shadow",
  "insufficient_profile",
]);

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function isUnit01(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
}

function isPenaltyTotal(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 0.3;
}

function isDisplay100(x: unknown): x is number {
  return (
    typeof x === "number" &&
    Number.isFinite(x) &&
    Number.isInteger(x) &&
    x >= 0 &&
    x <= 100
  );
}

function isNonNegInt(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 0;
}

function isCapApplied(x: unknown): x is number | null {
  if (x === null) return true;
  return isUnit01(x);
}

function missing(): ViewerSafeRelationshipProfileScoreV2 {
  return {
    scoringVersion: "",
    rawCompatibilityScore: null,
    weightedBaseScore: null,
    penaltyTotal: null,
    cappedRawScore: null,
    displayScore100: null,
    band: "missing",
    capApplied: null,
    coreConflictCount: null,
    strongConflictCount: null,
    redFlagConflictCount: null,
    validAxisCount: null,
    skippedAxisCount: null,
    source: "missing",
  };
}

function invalid(): ViewerSafeRelationshipProfileScoreV2 {
  return {
    scoringVersion: "",
    rawCompatibilityScore: null,
    weightedBaseScore: null,
    penaltyTotal: null,
    cappedRawScore: null,
    displayScore100: null,
    band: "missing",
    capApplied: null,
    coreConflictCount: null,
    strongConflictCount: null,
    redFlagConflictCount: null,
    validAxisCount: null,
    skippedAxisCount: null,
    source: "invalid",
  };
}

function isValidScoreShadowV2Row(row: Record<string, unknown>): boolean {
  if (row.scoringVersion !== EXPECTED_SCORING_VERSION) return false;
  if (typeof row.source !== "string" || !WORKER_ROW_SOURCES.has(row.source)) {
    return false;
  }
  if (!isUnit01(row.rawCompatibilityScore)) return false;
  if (!isUnit01(row.weightedBaseScore)) return false;
  if (!isPenaltyTotal(row.penaltyTotal)) return false;
  if (!isUnit01(row.cappedRawScore)) return false;
  if (!isDisplay100(row.displayScore100)) return false;
  if (typeof row.band !== "string" || !BANDS.has(row.band)) return false;
  if (!isCapApplied(row.capApplied)) return false;
  if (!isNonNegInt(row.coreConflictCount)) return false;
  if (!isNonNegInt(row.strongConflictCount)) return false;
  if (!isNonNegInt(row.redFlagConflictCount)) return false;
  if (!isNonNegInt(row.validAxisCount)) return false;
  if (!isNonNegInt(row.skippedAxisCount)) return false;
  return true;
}

/**
 * Maps `matchInsights.scoreShadowV2` to a fixed viewer-safe envelope.
 * Unknown / extra keys on the persisted JSON are never copied through.
 */
export function resolveRelationshipProfileScoreV2Shadow(
  matchInsights: unknown,
): ViewerSafeRelationshipProfileScoreV2 {
  if (!isRecord(matchInsights)) return missing();
  const row = matchInsights.scoreShadowV2;
  if (row == null) return missing();
  if (!isRecord(row)) return invalid();
  if (!isValidScoreShadowV2Row(row)) return invalid();
  return {
    scoringVersion: EXPECTED_SCORING_VERSION,
    rawCompatibilityScore: row.rawCompatibilityScore as number,
    weightedBaseScore: row.weightedBaseScore as number,
    penaltyTotal: row.penaltyTotal as number,
    cappedRawScore: row.cappedRawScore as number,
    displayScore100: row.displayScore100 as number,
    band: row.band as ViewerSafeRelationshipProfileScoreV2Band,
    capApplied: row.capApplied as number | null,
    coreConflictCount: row.coreConflictCount as number,
    strongConflictCount: row.strongConflictCount as number,
    redFlagConflictCount: row.redFlagConflictCount as number,
    validAxisCount: row.validAxisCount as number,
    skippedAxisCount: row.skippedAxisCount as number,
    source: "match_insights_score_shadow_v2",
  };
}
