import { ForbiddenException, UnauthorizedException } from "@nestjs/common";

/** Env-driven allowlists for dev/QA-only web test hooks. */

function parseIds(raw: string | undefined): Set<string> {
  const ids = (raw ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(ids);
}

function isTruthy(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isTestMatchFeatureEnabled(): boolean {
  return isTruthy(process.env.PEIMA_TEST_MATCH_ENABLED);
}

export function isTestMatchFeatureDisabled(): boolean {
  return isTruthy(process.env.PEIMA_TEST_MATCH_DISABLED);
}

export function canUserTriggerTestMatch(userId: string | undefined): boolean {
  if (!userId || !isTestMatchFeatureEnabled() || isTestMatchFeatureDisabled()) {
    return false;
  }
  const allow = parseIds(process.env.PEIMA_TEST_MATCH_USER_IDS);
  return allow.has(userId);
}

export function assertCanTriggerTestMatch(
  userId: string | undefined,
): asserts userId is string {
  if (!userId) {
    throw new UnauthorizedException("not authenticated");
  }
  if (!isTestMatchFeatureEnabled()) {
    throw new ForbiddenException(
      "test match trigger is off (set PEIMA_TEST_MATCH_ENABLED=1)",
    );
  }
  if (isTestMatchFeatureDisabled()) {
    throw new ForbiddenException(
      "test match trigger is disabled (PEIMA_TEST_MATCH_DISABLED)",
    );
  }
  const allow = parseIds(process.env.PEIMA_TEST_MATCH_USER_IDS);
  if (allow.size === 0) {
    throw new ForbiddenException(
      "set PEIMA_TEST_MATCH_USER_IDS to your user id (comma-separated)",
    );
  }
  if (!allow.has(userId)) {
    throw new ForbiddenException(
      "test match: your user id is not in PEIMA_TEST_MATCH_USER_IDS",
    );
  }
}

export function isTestPreviewPoolSeedEnabled(): boolean {
  return isTruthy(process.env.PEIMA_TEST_PREVIEW_POOL_SEED_ENABLED);
}

export function isTestPreviewPoolSeedDisabled(): boolean {
  return isTruthy(process.env.PEIMA_TEST_PREVIEW_POOL_SEED_DISABLED);
}

export function canUserSeedTestPreviewPool(userId: string | undefined): boolean {
  if (
    !userId ||
    !isTestPreviewPoolSeedEnabled() ||
    isTestPreviewPoolSeedDisabled()
  ) {
    return false;
  }
  const allow = parseIds(process.env.PEIMA_TEST_PREVIEW_POOL_SEED_USER_IDS);
  return allow.has(userId);
}

export function isTestMatchResultWriterEnabled(): boolean {
  return isTruthy(process.env.PEIMA_TEST_MATCH_RESULT_WRITER_ENABLED);
}

export function isTestMatchResultWriterDisabled(): boolean {
  return isTruthy(process.env.PEIMA_TEST_MATCH_RESULT_WRITER_DISABLED);
}

/** Mirrors worker allowlist gate for local batch-match MatchResult writes (audit / docs only). */
export function canUserWriteMatchResultViaTestAllowlist(
  userId: string | undefined,
): boolean {
  if (!userId || !isTestMatchResultWriterEnabled() || isTestMatchResultWriterDisabled()) {
    return false;
  }
  const allow = parseIds(process.env.PEIMA_TEST_MATCH_RESULT_WRITER_USER_IDS);
  return allow.has(userId);
}

export function assertCanSeedTestPreviewPool(
  userId: string | undefined,
): asserts userId is string {
  if (!userId) {
    throw new UnauthorizedException("not authenticated");
  }
  if (!isTestPreviewPoolSeedEnabled()) {
    throw new ForbiddenException(
      "test preview pool seed is off (set PEIMA_TEST_PREVIEW_POOL_SEED_ENABLED=1)",
    );
  }
  if (isTestPreviewPoolSeedDisabled()) {
    throw new ForbiddenException(
      "test preview pool seed is disabled (PEIMA_TEST_PREVIEW_POOL_SEED_DISABLED)",
    );
  }
  const allow = parseIds(process.env.PEIMA_TEST_PREVIEW_POOL_SEED_USER_IDS);
  if (allow.size === 0) {
    throw new ForbiddenException(
      "set PEIMA_TEST_PREVIEW_POOL_SEED_USER_IDS to your user id (comma-separated)",
    );
  }
  if (!allow.has(userId)) {
    throw new ForbiddenException(
      "test preview pool seed: your user id is not in PEIMA_TEST_PREVIEW_POOL_SEED_USER_IDS",
    );
  }
}
