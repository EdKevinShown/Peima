/**
 * Preview-pool sorting helpers — logic MUST stay aligned with
 * `apps/worker/src/jobs/matching-score.ts` (`computePreferenceScore`, `computeStyleScore`).
 * Do not change weights or worker formulas here; this module is for ordering only.
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
 * Intersection / len(viewer tags). Viewer has no tags -> score 0 (compat with worker).
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
