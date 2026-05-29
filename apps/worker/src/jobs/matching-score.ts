/**
 * Rule-based finalScore v1 for batch matching (no AI).
 * Weights renormalize when viewer has no styleTags (style term excluded).
 */

export type ViewerPreferenceLike = {
  minAge: number | null;
  maxAge: number | null;
  preferredCities: string[];
  minHeight: number | null;
  maxHeight: number | null;
  educationPreferences: string[];
  occupationPreferences: string[];
  relationshipGoalPreferences: string[];
  styleTags: string[];
} | null;

export type CandidateUserLike = {
  age: number | null;
  city: string;
  height: number | null;
  education: string;
  occupation: string;
  relationshipGoal: string;
};

export type UserImageLike = {
  styleTags: string[];
} | null;

/**
 * G1-R questionnaire axes on `UserProfile` (order aligned with API scorer / Prisma).
 * `confidence` is stored on DB row but is not used in `computeProfileScore`.
 */
export type UserProfileLike =
  | null
  | {
      attachmentStyle: number | null;
      emotionalExpression: number | null;
      communicationStyle: number | null;
      conflictHandling: number | null;
      loveLanguage: number | null;
      securityNeed: number | null;
      controlNeed: number | null;
      independence: number | null;
      loyaltyView: number | null;
      jealousyTendency: number | null;
      moneyAttitude: number | null;
      careerPriority: number | null;
      lifePace: number | null;
      socialNeed: number | null;
      emotionalStability: number | null;
      sexualValues: number | null;
      familyView: number | null;
      marriageExpectation: number | null;
      childrenIntent: number | null;
      riskPreference: number | null;
    };

export type PoolItemLike = {
  baseScore: number | null;
  rankInPool: number;
};

const W_PREVIEW = 0.35;
const W_PREF = 0.3;
const W_STYLE = 0.15;
const W_PROF = 0.2;

const PROFILE_DIMS = [
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

function norm(s: string | null | undefined): string {
  return String(s ?? "").trim();
}

function inList(value: string, list: string[]): boolean {
  const v = norm(value);
  if (!v) return false;
  const set = new Set(list.map((x) => norm(x)).filter(Boolean));
  return set.has(v);
}

/** preferenceScore: hits / denom; denom 0 -> 0 */
export function computePreferenceScore(
  pref: ViewerPreferenceLike,
  c: CandidateUserLike,
): number {
  if (!pref) return 0;

  let denom = 0;
  let hits = 0;

  if (pref.minAge != null && pref.maxAge != null) {
    denom++;
    if (
      c.age != null &&
      c.age >= pref.minAge &&
      c.age <= pref.maxAge
    ) {
      hits++;
    }
  }

  if (pref.preferredCities.length > 0) {
    denom++;
    if (inList(c.city, pref.preferredCities)) hits++;
  }

  if (pref.minHeight != null && pref.maxHeight != null) {
    denom++;
    if (
      c.height != null &&
      c.height >= pref.minHeight &&
      c.height <= pref.maxHeight
    ) {
      hits++;
    }
  }

  if (pref.educationPreferences.length > 0) {
    denom++;
    if (inList(c.education, pref.educationPreferences)) hits++;
  }

  if (pref.occupationPreferences.length > 0) {
    denom++;
    if (inList(c.occupation, pref.occupationPreferences)) hits++;
  }

  if (pref.relationshipGoalPreferences.length > 0) {
    denom++;
    if (inList(c.relationshipGoal, pref.relationshipGoalPreferences)) hits++;
  }

  if (denom === 0) return 0;
  return hits / denom;
}

/**
 * Intersection / len(viewer tags). Viewer has no tags -> weight 0 (renormalized);
 * score ignored when inactive.
 */
export function computeStyleScore(
  pref: ViewerPreferenceLike,
  image: UserImageLike,
): { score: number; styleWeightActive: boolean } {
  const viewerTags =
    pref?.styleTags?.map((t) => norm(t)).filter(Boolean) ?? [];
  if (viewerTags.length === 0) {
    return { score: 0, styleWeightActive: false };
  }

  const candTags =
    image?.styleTags?.map((t) => norm(t)).filter(Boolean) ?? [];
  if (candTags.length === 0) {
    return { score: 0, styleWeightActive: true };
  }

  const candSet = new Set(candTags);
  let inter = 0;
  for (const t of viewerTags) {
    if (candSet.has(t)) inter++;
  }
  return { score: inter / viewerTags.length, styleWeightActive: true };
}

/** Both profiles with overlapping dims -> avg(1-|a-b|); missing side or dims -> 0.5 */
export function computeProfileScore(
  viewer: UserProfileLike,
  candidate: UserProfileLike,
): number {
  if (!candidate || !viewer) return 0.5;

  let sum = 0;
  let n = 0;
  for (const d of PROFILE_DIMS) {
    const a = viewer[d];
    const b = candidate[d];
    if (a != null && b != null) {
      sum += 1 - Math.abs(a - b);
      n++;
    }
  }
  if (n === 0) return 0.5;
  return sum / n;
}

export type ScoreComponentsV1 = {
  previewPoolScore: number;
  preferenceScore: number;
  styleScore: number;
  profileScore: number;
  finalScore: number;
};

export function computeFinalScoreV1(params: {
  item: PoolItemLike;
  viewerPreference: ViewerPreferenceLike;
  viewerProfile: UserProfileLike;
  candidateUser: CandidateUserLike;
  candidateImage: UserImageLike;
  candidateProfile: UserProfileLike;
}): ScoreComponentsV1 {
  const previewPoolScore = params.item.baseScore ?? 0;
  const preferenceScore = computePreferenceScore(
    params.viewerPreference,
    params.candidateUser,
  );
  const { score: styleScore, styleWeightActive } = computeStyleScore(
    params.viewerPreference,
    params.candidateImage,
  );
  const profileScore = computeProfileScore(
    params.viewerProfile,
    params.candidateProfile,
  );

  const wStyle = styleWeightActive ? W_STYLE : 0;
  const wSum = W_PREVIEW + W_PREF + wStyle + W_PROF;
  const finalScore =
    (W_PREVIEW * previewPoolScore +
      W_PREF * preferenceScore +
      wStyle * styleScore +
      W_PROF * profileScore) /
    wSum;

  return {
    previewPoolScore,
    preferenceScore,
    styleScore,
    profileScore,
    finalScore,
  };
}

export function formatReasonSummaryV1(c: ScoreComponentsV1): string {
  const f = (x: number) => Number(x.toFixed(6));
  return `Selected by finalScore v1 (previewPoolScore=${f(c.previewPoolScore)}, preferenceScore=${f(c.preferenceScore)}, styleScore=${f(c.styleScore)}, profileScore=${f(c.profileScore)}).`;
}

/** M6.0-E: persisted under `matchInsights.scoreShadow` (JSON); mirrors v1 final + profile only. */
export const SCORING_VERSION_M60_SHADOW = "m6.0-profile-score-shadow-v1" as const;

export type ScoreShadowM60 = {
  finalScoreV1: number;
  relationshipProfileScore: number;
  scoringVersion: typeof SCORING_VERSION_M60_SHADOW;
};

function isUnitInterval01(x: number): boolean {
  return Number.isFinite(x) && x >= 0 && x <= 1;
}

export function buildScoreShadowM60(c: ScoreComponentsV1): ScoreShadowM60 {
  if (!isUnitInterval01(c.finalScore) || !isUnitInterval01(c.profileScore)) {
    throw new Error(
      `buildScoreShadowM60: expected finite scores in [0,1], got finalScore=${String(c.finalScore)} profileScore=${String(c.profileScore)}`,
    );
  }
  return {
    finalScoreV1: c.finalScore,
    relationshipProfileScore: c.profileScore,
    scoringVersion: SCORING_VERSION_M60_SHADOW,
  };
}