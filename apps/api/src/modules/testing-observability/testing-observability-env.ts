/** Feature gate for local/staging testing observability API. */

import { isProductionNodeEnv } from "../../common/config/jwt-secret.config";

export const TEST_OBSERVABILITY_DEBUG_TOKEN_MIN_LENGTH = 32;

const FORBIDDEN_DEBUG_TOKENS = new Set([
  "secret",
  "local-dev-only",
  "changeme",
  "debug",
  "testing",
  "peima-test-observability-token",
]);

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

function parseAdminUserIdsFromEnv(env: NodeJS.ProcessEnv): Set<string> {
  const raw = env.PEIMA_ADMIN_USER_IDS ?? "";
  const ids = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(ids);
}

function formatTestingObservabilityConfigError(message: string): Error {
  return new Error(`${message} Generate one with: openssl rand -hex 32`);
}

/** Reject weak or placeholder debug tokens when observability is enabled. */
export function assertTestingObservabilityDebugTokenStrong(
  token: string,
): void {
  const trimmed = token.trim();
  if (!trimmed) {
    throw formatTestingObservabilityConfigError(
      "PEIMA_TEST_OBSERVABILITY_TOKEN must not be empty when testing observability is enabled.",
    );
  }
  if (FORBIDDEN_DEBUG_TOKENS.has(trimmed.toLowerCase())) {
    throw formatTestingObservabilityConfigError(
      "PEIMA_TEST_OBSERVABILITY_TOKEN must not use a known weak placeholder.",
    );
  }
  if (trimmed.length < TEST_OBSERVABILITY_DEBUG_TOKEN_MIN_LENGTH) {
    throw formatTestingObservabilityConfigError(
      `PEIMA_TEST_OBSERVABILITY_TOKEN must be at least ${TEST_OBSERVABILITY_DEBUG_TOKEN_MIN_LENGTH} characters (got ${trimmed.length}).`,
    );
  }
}

/**
 * Validate observability env when the feature flag is on.
 * Production requires explicit strong debug token and PEIMA_ADMIN_USER_IDS.
 */
export function assertTestingObservabilityStartupConfig(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isTestingObservabilityEnabled(env)) {
    return;
  }

  const token = readTestingObservabilityToken(env);

  if (isProductionNodeEnv()) {
    if (!token) {
      throw formatTestingObservabilityConfigError(
        "PEIMA_TEST_OBSERVABILITY_TOKEN is required when PEIMA_TEST_OBSERVABILITY_ENABLED=1 and NODE_ENV=production.",
      );
    }
    assertTestingObservabilityDebugTokenStrong(token);
    if (parseAdminUserIdsFromEnv(env).size === 0) {
      throw formatTestingObservabilityConfigError(
        "PEIMA_ADMIN_USER_IDS must list at least one admin when testing observability is enabled in production.",
      );
    }
    return;
  }

  if (token) {
    assertTestingObservabilityDebugTokenStrong(token);
  }
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

export type TestingObservabilityAuthContext = {
  callerUserId: string | null;
  via: "admin_jwt" | "debug_token";
};

export function formatTestingMatchFeedbackSource(
  baseSource: string | undefined,
  auth: TestingObservabilityAuthContext,
  subjectUserId: string,
): string {
  const base = baseSource?.trim() || "testing_monitor_ui";
  const caller = auth.callerUserId?.trim() || "anonymous";
  return `${base}|caller=${caller}|via=${auth.via}|subjectUserId=${subjectUserId}`;
}
