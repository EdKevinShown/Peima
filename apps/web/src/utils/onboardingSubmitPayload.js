import {
  ACCOUNT_CITY_VALUES,
  ACCOUNT_DISPLAY_GENDER,
  ACCOUNT_EDUCATION_VALUES,
  ACCOUNT_GENDER_VALUES,
  ACCOUNT_MAX_AGE,
  ACCOUNT_MAX_HEIGHT_CM,
  ACCOUNT_MIN_AGE,
  ACCOUNT_MIN_HEIGHT_CM,
  ACCOUNT_OCCUPATION_CATEGORY_VALUES,
  ACCOUNT_RELATIONSHIP_GOAL_VALUES,
  ACCOUNT_STYLE_TAG_WHITELIST,
} from "@peima/shared/constants";

/** Legacy `/onboarding` UI labels → structured `User.relationshipGoal`. */
const LEGACY_RELATIONSHIP_GOAL_UI_TO_API = {
  认真交往: "认真恋爱",
  先从朋友开始: "先认识了解",
  开放关系: "长期关系",
  步入婚姻: "结婚导向",
  暂不确定: "暂不确定",
};

const GENDER_UI_TO_API = {
  ...Object.fromEntries(
    Object.entries(ACCOUNT_DISPLAY_GENDER).map(([api, label]) => [label, api]),
  ),
};

const CITY_SET = new Set(ACCOUNT_CITY_VALUES);
const EDUCATION_SET = new Set(ACCOUNT_EDUCATION_VALUES);
const OCCUPATION_SET = new Set(ACCOUNT_OCCUPATION_CATEGORY_VALUES);
const RELATIONSHIP_GOAL_SET = new Set(ACCOUNT_RELATIONSHIP_GOAL_VALUES);
const GENDER_SET = new Set(ACCOUNT_GENDER_VALUES);
const STYLE_TAG_SET = new Set(ACCOUNT_STYLE_TAG_WHITELIST);

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function mapOnboardingGender(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (GENDER_SET.has(s)) return s;
  return GENDER_UI_TO_API[s] ?? null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function mapOnboardingRelationshipGoal(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (RELATIONSHIP_GOAL_SET.has(s)) return s;
  return LEGACY_RELATIONSHIP_GOAL_UI_TO_API[s] ?? null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function mapOnboardingOccupation(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (OCCUPATION_SET.has(s)) return s;
  return "其他";
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function mapOnboardingCity(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (CITY_SET.has(s)) return s;
  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function mapOnboardingEducation(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (EDUCATION_SET.has(s)) return s;
  return null;
}

/**
 * @param {unknown} values
 * @returns {string[]}
 */
export function mapOnboardingRelationshipGoalPreferences(values) {
  if (!Array.isArray(values)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const mapped = mapOnboardingRelationshipGoal(raw);
    if (mapped && !seen.has(mapped)) {
      seen.add(mapped);
      out.push(mapped);
    }
  }
  return out;
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | null}
 */
function boundedInt(value, min, max) {
  if (value === "" || value == null) return null;
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  if (Number.isNaN(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/**
 * Build PATCH /users payload from onboarding answers.
 * Only includes profile fields the user actually completed in this flow (`touchedKeys`).
 *
 * @param {Record<string, unknown>} answers
 * @param {Set<string>} touchedKeys
 * @returns {Record<string, unknown>}
 */
export function buildOnboardingProfilePayload(answers, touchedKeys) {
  /** @type {Record<string, unknown>} */
  const payload = {};

  if (touchedKeys.has("nickname")) {
    const nickname = String(answers.nickname ?? "").trim();
    if (nickname.length >= 2) payload.nickname = nickname;
  }

  if (touchedKeys.has("gender")) {
    const gender = mapOnboardingGender(answers.gender);
    if (gender) payload.gender = gender;
  }

  if (touchedKeys.has("age")) {
    const age = boundedInt(answers.age, ACCOUNT_MIN_AGE, ACCOUNT_MAX_AGE);
    if (age != null) payload.age = age;
  }

  if (touchedKeys.has("height")) {
    const height = boundedInt(
      answers.height,
      ACCOUNT_MIN_HEIGHT_CM,
      ACCOUNT_MAX_HEIGHT_CM,
    );
    if (height != null) payload.height = height;
  }

  if (touchedKeys.has("city")) {
    const city = mapOnboardingCity(answers.city);
    if (city) payload.city = city;
  }

  if (touchedKeys.has("education")) {
    const education = mapOnboardingEducation(answers.education);
    if (education) payload.education = education;
  }

  if (touchedKeys.has("occupation")) {
    const occupation = mapOnboardingOccupation(answers.occupation);
    if (occupation) payload.occupation = occupation;
  }

  if (touchedKeys.has("relationshipGoal")) {
    const relationshipGoal = mapOnboardingRelationshipGoal(
      answers.relationshipGoal,
    );
    if (relationshipGoal) payload.relationshipGoal = relationshipGoal;
  }

  if (touchedKeys.has("bio")) {
    const bio = String(answers.bio ?? "").trim();
    if (bio) payload.bio = bio.slice(0, 200);
  }

  return payload;
}

/**
 * @param {Record<string, unknown>} answers
 * @param {Set<string>} touchedKeys
 * @returns {import("../api/preferences").UpsertPreferencePayload}
 */
export function buildOnboardingPreferencePayload(answers, touchedKeys) {
  /** @type {import("../api/preferences").UpsertPreferencePayload} */
  const payload = {};

  if (touchedKeys.has("minAge") || touchedKeys.has("maxAge")) {
    const minAge = boundedInt(answers.minAge, ACCOUNT_MIN_AGE, ACCOUNT_MAX_AGE);
    const maxAge = boundedInt(answers.maxAge, ACCOUNT_MIN_AGE, ACCOUNT_MAX_AGE);
    if (minAge != null) payload.minAge = minAge;
    if (maxAge != null) payload.maxAge = maxAge;
    if (
      payload.minAge != null &&
      payload.maxAge != null &&
      payload.minAge > payload.maxAge
    ) {
      delete payload.minAge;
      delete payload.maxAge;
    }
  }

  if (touchedKeys.has("minHeight") || touchedKeys.has("maxHeight")) {
    const minHeight = boundedInt(
      answers.minHeight,
      ACCOUNT_MIN_HEIGHT_CM,
      ACCOUNT_MAX_HEIGHT_CM,
    );
    const maxHeight = boundedInt(
      answers.maxHeight,
      ACCOUNT_MIN_HEIGHT_CM,
      ACCOUNT_MAX_HEIGHT_CM,
    );
    if (minHeight != null) payload.minHeight = minHeight;
    if (maxHeight != null) payload.maxHeight = maxHeight;
    if (
      payload.minHeight != null &&
      payload.maxHeight != null &&
      payload.minHeight > payload.maxHeight
    ) {
      delete payload.minHeight;
      delete payload.maxHeight;
    }
  }

  if (touchedKeys.has("preferredCities")) {
    const cities = Array.isArray(answers.preferredCities)
      ? answers.preferredCities
          .map((c) => mapOnboardingCity(c))
          .filter(Boolean)
      : [];
    payload.preferredCities = cities;
  }

  if (touchedKeys.has("educationPreferences")) {
    payload.educationPreferences = Array.isArray(answers.educationPreferences)
      ? answers.educationPreferences.filter((e) => EDUCATION_SET.has(String(e)))
      : [];
  }

  if (touchedKeys.has("relationshipGoalPreferences")) {
    payload.relationshipGoalPreferences =
      mapOnboardingRelationshipGoalPreferences(
        answers.relationshipGoalPreferences,
      );
  }

  if (touchedKeys.has("styleTags")) {
    const tags = Array.isArray(answers.styleTags)
      ? answers.styleTags
          .map((t) => String(t).trim())
          .filter((t) => STYLE_TAG_SET.has(t))
      : [];
    if (tags.length > 0) payload.styleTags = tags;
  }

  return payload;
}

/**
 * @param {{ phaseIntro?: boolean; type?: string; key?: string; keyMin?: string; keyMax?: string }} step
 * @returns {string[]}
 */
export function onboardingStepFieldKeys(step) {
  if (step.phaseIntro) return [];
  if (step.type === "range") {
    return [step.keyMin, step.keyMax].filter(Boolean);
  }
  if (step.key) return [step.key];
  return [];
}
