import { ForbiddenException, UnauthorizedException } from "@nestjs/common";

/** Env-driven allowlist for dev/QA: trigger batch-match once from the web UI. */

function parseIds(raw: string | undefined): Set<string> {
  const ids = (raw ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(ids);
}

export function isTestMatchFeatureEnabled(): boolean {
  const v = process.env.PEIMA_TEST_MATCH_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isTestMatchFeatureDisabled(): boolean {
  const v = process.env.PEIMA_TEST_MATCH_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function canUserTriggerTestMatch(userId: string | undefined): boolean {
  if (!userId || !isTestMatchFeatureEnabled() || isTestMatchFeatureDisabled()) {
    return false;
  }
  const allow = parseIds(process.env.PEIMA_TEST_MATCH_USER_IDS);
  return allow.has(userId);
}

export function assertCanTriggerTestMatch(userId: string | undefined): void {
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
