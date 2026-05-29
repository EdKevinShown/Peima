/**
 * M6.0-J2 — relationshipProfileScore V2 pure helper (no I/O, no worker wiring).
 * Formula per docs/M6/M6.0-j1b-relationship-profile-score-v2-formula-design.md
 * with J2 deltas: redFlagConflictCount uses diff > 0.60 on red-flag axes;
 * insufficient_profile when validAxisCount < 8 (display capped at 62).
 */

export const RELATIONSHIP_PROFILE_SCORE_V2_VERSION =
  "m6.0-relationship-profile-score-v2-shadow" as const;

/** Axis keys aligned with `PROFILE_DIMS` / G1-R `UserProfile` questionnaire fields. */
export const G1R_PROFILE_AXIS_KEYS = [
  "attachmentStyle",
  "emotionalExpression",
  "communicationStyle",
  "conflictHandling",
  "loveLanguage",
  "securityNeed",
  "controlNeed",
  "independence",
  "loyaltyView",
  "jealousyTendency",
  "moneyAttitude",
  "careerPriority",
  "lifePace",
  "socialNeed",
  "emotionalStability",
  "sexualValues",
  "familyView",
  "marriageExpectation",
  "childrenIntent",
  "riskPreference",
] as const;

export type G1rProfileAxisKey = (typeof G1R_PROFILE_AXIS_KEYS)[number];

export type RelationshipProfileLike = Partial<
  Record<G1rProfileAxisKey, number | null | undefined>
>;

export const RELATIONSHIP_PROFILE_SCORE_V2_CORE_AXES: ReadonlySet<G1rProfileAxisKey> =
  new Set([
    "attachmentStyle",
    "communicationStyle",
    "conflictHandling",
    "securityNeed",
    "emotionalStability",
    "lifePace",
    "familyView",
    "marriageExpectation",
    "childrenIntent",
    "riskPreference",
  ]);

export const RELATIONSHIP_PROFILE_SCORE_V2_REDFLAG_AXES: ReadonlySet<G1rProfileAxisKey> =
  new Set([
    "marriageExpectation",
    "childrenIntent",
    "familyView",
    "conflictHandling",
    "securityNeed",
  ]);

/** Weights per J1B / M6.0-J2: core 2.0, auxiliary 1.0, sexualValues 0.5. */
export const RELATIONSHIP_PROFILE_SCORE_V2_AXIS_WEIGHTS: Readonly<
  Record<G1rProfileAxisKey, number>
> = {
  attachmentStyle: 2.0,
  emotionalExpression: 1.0,
  communicationStyle: 2.0,
  conflictHandling: 2.0,
  loveLanguage: 1.0,
  securityNeed: 2.0,
  controlNeed: 1.0,
  independence: 1.0,
  loyaltyView: 1.0,
  jealousyTendency: 1.0,
  moneyAttitude: 1.0,
  careerPriority: 1.0,
  lifePace: 2.0,
  socialNeed: 1.0,
  emotionalStability: 2.0,
  sexualValues: 0.5,
  familyView: 2.0,
  marriageExpectation: 2.0,
  childrenIntent: 2.0,
  riskPreference: 2.0,
};

const PENALTY_CAP = 0.3;
const INSUFFICIENT_VALID_AXIS_THRESHOLD = 8;
const INSUFFICIENT_DISPLAY_CAP = 62;

export type RelationshipProfileScoreV2Band =
  | "strong_conflict"
  | "low"
  | "medium"
  | "good"
  | "high";

export type RelationshipProfileScoreV2Source =
  | "profile_v2_shadow"
  | "insufficient_profile";

export type RelationshipProfileScoreV2Result = {
  scoringVersion: typeof RELATIONSHIP_PROFILE_SCORE_V2_VERSION;
  rawCompatibilityScore: number;
  weightedBaseScore: number;
  penaltyTotal: number;
  cappedRawScore: number;
  displayScore100: number;
  band: RelationshipProfileScoreV2Band;
  capApplied: number | null;
  coreConflictCount: number;
  strongConflictCount: number;
  redFlagConflictCount: number;
  validAxisCount: number;
  skippedAxisCount: number;
  source: RelationshipProfileScoreV2Source;
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function readAxis01(
  profile: RelationshipProfileLike | null | undefined,
  key: G1rProfileAxisKey,
): number | null {
  if (!profile) return null;
  const v = profile[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < 0 || v > 1) return null;
  return v;
}

/** t in [0,1] then lerp outMin→outMax */
export function mapRange(
  x: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (!Number.isFinite(x)) return outMin;
  if (!Number.isFinite(inMin) || !Number.isFinite(inMax) || inMax === inMin) {
    return outMin;
  }
  const t = clamp01((x - inMin) / (inMax - inMin));
  return outMin + t * (outMax - outMin);
}

/** Piecewise monotone map: capped raw [0,1] → display [0,100]. */
export function cappedRawToDisplay100(cappedRaw: number): number {
  const r = clamp01(cappedRaw);
  let d: number;
  if (r >= 0.9) {
    d = mapRange(r, 0.9, 1.0, 90, 100);
  } else if (r >= 0.82) {
    d = mapRange(r, 0.82, 0.9, 78, 90);
  } else if (r >= 0.72) {
    d = mapRange(r, 0.72, 0.82, 62, 78);
  } else if (r >= 0.55) {
    d = mapRange(r, 0.55, 0.72, 40, 62);
  } else {
    d = mapRange(r, 0, 0.55, 0, 40);
  }
  return Math.max(0, Math.min(100, Math.round(d)));
}

export function display100ToBand(display: number): RelationshipProfileScoreV2Band {
  const s = Math.round(clamp01(display / 100) * 100);
  if (s < 40) return "strong_conflict";
  if (s < 60) return "low";
  if (s < 75) return "medium";
  if (s < 88) return "good";
  return "high";
}

function penaltyForDiff(diff: number): number {
  if (diff > 0.6) return 0.07;
  if (diff > 0.45) return 0.035;
  if (diff > 0.35) return 0.015;
  return 0;
}

function computeCapApplied(params: {
  strongConflictCount: number;
  coreConflictCount: number;
  redFlagConflictCount: number;
}): number | null {
  const caps: number[] = [];
  if (params.strongConflictCount >= 1) caps.push(0.82);
  if (params.coreConflictCount >= 2) caps.push(0.78);
  if (params.coreConflictCount >= 3) caps.push(0.72);
  if (params.redFlagConflictCount >= 1) caps.push(0.68);
  if (caps.length === 0) return null;
  return Math.min(...caps);
}

/**
 * V2 relationship profile score (shadow contract).
 * Does not read DB, questionnaire rows, pool, or RRM.
 */
export function computeRelationshipProfileScoreV2(
  viewerProfile: RelationshipProfileLike | null | undefined,
  candidateProfile: RelationshipProfileLike | null | undefined,
): RelationshipProfileScoreV2Result {
  let weightedNumer = 0;
  let weightedDenom = 0;
  let skippedAxisCount = 0;
  let validAxisCount = 0;

  let penaltySum = 0;
  let coreConflictCount = 0;
  let strongConflictCount = 0;
  let redFlagConflictCount = 0;

  for (const key of G1R_PROFILE_AXIS_KEYS) {
    const w = RELATIONSHIP_PROFILE_SCORE_V2_AXIS_WEIGHTS[key];
    if (w <= 0) continue;

    const va = readAxis01(viewerProfile, key);
    const vb = readAxis01(candidateProfile, key);
    if (va === null || vb === null) {
      skippedAxisCount += 1;
      continue;
    }

    validAxisCount += 1;
    const sim = 1 - Math.abs(va - vb);
    weightedNumer += sim * w;
    weightedDenom += w;

    if (!RELATIONSHIP_PROFILE_SCORE_V2_CORE_AXES.has(key)) continue;

    const diff = Math.abs(va - vb);
    if (diff > 0.45) coreConflictCount += 1;
    if (diff > 0.6) strongConflictCount += 1;
    if (
      RELATIONSHIP_PROFILE_SCORE_V2_REDFLAG_AXES.has(key) &&
      diff > 0.6
    ) {
      redFlagConflictCount += 1;
    }

    penaltySum += penaltyForDiff(diff);
  }

  penaltySum = Math.min(PENALTY_CAP, penaltySum);

  const weightedBaseScore =
    weightedDenom > 0 ? weightedNumer / weightedDenom : 0;

  const rawCompatibilityScore = clamp01(weightedBaseScore - penaltySum);

  const capApplied = computeCapApplied({
    strongConflictCount,
    coreConflictCount,
    redFlagConflictCount,
  });
  const cappedRawScore = clamp01(
    Math.min(rawCompatibilityScore, capApplied ?? 1),
  );

  let displayScore100 = cappedRawToDisplay100(cappedRawScore);
  let source: RelationshipProfileScoreV2Source = "profile_v2_shadow";

  if (validAxisCount < INSUFFICIENT_VALID_AXIS_THRESHOLD) {
    source = "insufficient_profile";
    displayScore100 = Math.min(displayScore100, INSUFFICIENT_DISPLAY_CAP);
  }

  displayScore100 = Math.round(clamp01(displayScore100 / 100) * 100);

  const band = display100ToBand(displayScore100);

  return {
    scoringVersion: RELATIONSHIP_PROFILE_SCORE_V2_VERSION,
    rawCompatibilityScore,
    weightedBaseScore,
    penaltyTotal: penaltySum,
    cappedRawScore,
    displayScore100,
    band,
    capApplied,
    coreConflictCount,
    strongConflictCount,
    redFlagConflictCount,
    validAxisCount,
    skippedAxisCount,
    source,
  };
}
