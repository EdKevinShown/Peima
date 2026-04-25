/**
 * Preview pool preference gating — dimensions MUST stay aligned with
 * `apps/worker/src/jobs/matching-score.ts` → `computePreferenceScore` (denom++ branches only).
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

/** Same denom count as `computePreferenceScore` when pref is non-null. */
export function preferenceGateDenominator(pref: PreferenceGatePref): number {
  let d = 0;
  if (pref.minAge != null && pref.maxAge != null) d++;
  if (pref.preferredCities.length > 0) d++;
  if (pref.minHeight != null && pref.maxHeight != null) d++;
  if (pref.educationPreferences.length > 0) d++;
  if (pref.occupationPreferences.length > 0) d++;
  if (pref.relationshipGoalPreferences.length > 0) d++;
  return d;
}

/**
 * Hard gate: every dimension that would increment `denom` in `computePreferenceScore`
 * must be satisfied (same bounds / lists as scoring).
 * `pref === null` or zero denom → always pass.
 */
export function passesPreferenceHardGate(
  pref: PreferenceGatePref | null,
  c: PreferenceGateCandidate,
): boolean {
  if (pref == null) return true;
  if (preferenceGateDenominator(pref) === 0) return true;

  if (pref.minAge != null && pref.maxAge != null) {
    if (
      c.age == null ||
      c.age < pref.minAge ||
      c.age > pref.maxAge
    ) {
      return false;
    }
  }

  if (pref.preferredCities.length > 0) {
    if (!inList(c.city, pref.preferredCities)) return false;
  }

  if (pref.minHeight != null && pref.maxHeight != null) {
    if (
      c.height == null ||
      c.height < pref.minHeight ||
      c.height > pref.maxHeight
    ) {
      return false;
    }
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
