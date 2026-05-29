/**
 * Preview pool preference gating — list dimensions align with
 * `apps/worker/src/jobs/matching-score.ts` → `computePreferenceScore` (worker unchanged).
 * Age / height: shared gate supports **one-sided** bounds (min-only / max-only); worker v1
 * still only scores bilateral age/height; API preview / onboarding uses this module + `preference-score.ts`.
 * `styleTags` are NOT part of preferenceScore denom and do NOT participate here.
 */

export type PreferenceGatePref = {
  minAge: number | null;
  maxAge: number | null;
  preferredCities: string[];
  minHeight: number | null;
  maxHeight: number | null;
  educationPreferences: string[];
  occupationPreferences: string[];
  relationshipGoalPreferences: string[];
};

export type PreferenceGateCandidate = {
  age: number | null;
  city: string;
  height: number | null;
  education: string;
  occupation: string;
  relationshipGoal: string;
};

function norm(s: string | null | undefined): string {
  return String(s ?? "").trim();
}

function inList(value: string, list: string[]): boolean {
  const v = norm(value);
  if (!v) return false;
  const set = new Set(list.map((x) => norm(x)).filter(Boolean));
  return set.has(v);
}

/**
 * Count of active preference dimensions (age/height count as one each when either bound set).
 * `denom === 0` → no constraints → pass-through.
 */
export function preferenceGateDenominator(pref: PreferenceGatePref): number {
  let d = 0;
  if (pref.minAge != null || pref.maxAge != null) d++;
  if (pref.preferredCities.length > 0) d++;
  if (pref.minHeight != null || pref.maxHeight != null) d++;
  if (pref.educationPreferences.length > 0) d++;
  if (pref.occupationPreferences.length > 0) d++;
  if (pref.relationshipGoalPreferences.length > 0) d++;
  return d;
}

function passesAgeGate(
  minAge: number | null,
  maxAge: number | null,
  age: number | null,
): boolean {
  if (minAge == null && maxAge == null) return true;
  if (age == null) return false;
  if (minAge != null && age < minAge) return false;
  if (maxAge != null && age > maxAge) return false;
  return true;
}

function passesHeightGate(
  minHeight: number | null,
  maxHeight: number | null,
  height: number | null,
): boolean {
  if (minHeight == null && maxHeight == null) return true;
  if (height == null) return false;
  if (minHeight != null && height < minHeight) return false;
  if (maxHeight != null && height > maxHeight) return false;
  return true;
}

/**
 * Hard gate: every configured dimension must be satisfied.
 * `pref === null` or zero denom → always pass.
 */
export function passesPreferenceHardGate(
  pref: PreferenceGatePref | null,
  c: PreferenceGateCandidate,
): boolean {
  if (pref == null) return true;
  if (preferenceGateDenominator(pref) === 0) return true;

  if (!passesAgeGate(pref.minAge, pref.maxAge, c.age)) {
    return false;
  }

  if (pref.preferredCities.length > 0) {
    if (!inList(c.city, pref.preferredCities)) return false;
  }

  if (!passesHeightGate(pref.minHeight, pref.maxHeight, c.height)) {
    return false;
  }

  if (pref.educationPreferences.length > 0) {
    if (!inList(c.education, pref.educationPreferences)) return false;
  }

  if (pref.occupationPreferences.length > 0) {
    if (!inList(c.occupation, pref.occupationPreferences)) return false;
  }

  if (pref.relationshipGoalPreferences.length > 0) {
    if (!inList(c.relationshipGoal, pref.relationshipGoalPreferences)) {
      return false;
    }
  }

  return true;
}
