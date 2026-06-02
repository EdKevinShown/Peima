/** Feature gate for local/staging testing observability API. */

export function isTestingObservabilityEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.PEIMA_TEST_OBSERVABILITY_ENABLED?.trim() === "1";
}

export function readTestingObservabilityToken(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.PEIMA_TEST_OBSERVABILITY_TOKEN?.trim() ?? "";
}

export const TESTING_OBSERVABILITY_SOURCE_VERSION =
  "testing-observability-v1" as const;

export const TESTING_MATCH_FEEDBACK_RATINGS = [
  "accurate",
  "okay",
  "inaccurate",
  "confusing",
  "photo_pool_inaccurate",
  "profile_inaccurate",
  "explanation_helpful",
  "explanation_not_helpful",
  "want_to_continue",
  "do_not_want_to_continue",
] as const;

export type TestingMatchFeedbackRating =
  (typeof TESTING_MATCH_FEEDBACK_RATINGS)[number];
