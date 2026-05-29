/**
 * Preview-pool sorting helpers — list scoring aligned with `preference-hard-gate.ts`.
 * Worker `apps/worker/src/jobs/matching-score.ts` is unchanged (bilateral age/height only there).
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

function ageHit(
  minAge: number | null,
  maxAge: number | null,
  age: number | null,
): boolean {
  if (minAge == null && maxAge == null) return false;
  if (age == null) return false;
  if (minAge != null && age < minAge) return false;
  if (maxAge != null && age > maxAge) return false;
  return true;
}

function heightHit(
  minHeight: number | null,
  maxHeight: number | null,
  height: number | null,
): boolean {
  if (minHeight == null && maxHeight == null) return false;
  if (height == null) return false;
  if (minHeight != null && height < minHeight) return false;
  if (maxHeight != null && height > maxHeight) return false;
  return true;
}

/** preferenceScore: hits / denom; denom 0 -> 0 */
export function computePreferenceScore(
  pref: ViewerPreferenceLike,
  c: CandidateUserLike,
): number {
  if (!pref) return 0;

  let denom = 0;
  let hits = 0;

  if (pref.minAge != null || pref.maxAge != null) {
    denom++;
    if (ageHit(pref.minAge, pref.maxAge, c.age)) hits++;
  }

  if (pref.preferredCities.length > 0) {
    denom++;
    if (inList(c.city, pref.preferredCities)) hits++;
  }

  if (pref.minHeight != null || pref.maxHeight != null) {
    denom++;
    if (heightHit(pref.minHeight, pref.maxHeight, c.height)) hits++;
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
