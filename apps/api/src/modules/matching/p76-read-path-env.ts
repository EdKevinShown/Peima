/**
 * P7.6-r8h1 — env gate for P7.6 allowlist sidecar read path / display overlay.
 * P7.10-r2b — PEIMA_P76_READ_PATH_SAFE_FALLBACK (preferred) with deprecated
 * PEIMA_P76_READ_PATH_FALLBACK_LEGACY alias.
 * Defaults: disabled, empty allowlist, PM/Ops signoff required, safe fallback on, strict violation block.
 */

import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "./p76-allowlist-apply-meta.types";

const TRUTHY = new Set(["1", "true", "yes"]);
const FALSY = new Set(["0", "false", "no"]);

function parseTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return defaultValue;
}

function parseViewerAllowlist(raw: string | undefined): string[] {
  if (raw == null || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isEnvExplicit(raw: string | undefined): boolean {
  return raw != null && raw.trim() !== "";
}

/**
 * Resolves safe-fallback toggle. New env wins when set; otherwise deprecated legacy alias.
 */
export function resolveP76ReadPathSafeFallback(env: NodeJS.ProcessEnv): {
  safeFallbackEnabled: boolean;
  deprecatedAliasUsed: boolean;
} {
  const safeRaw = env.PEIMA_P76_READ_PATH_SAFE_FALLBACK;
  const legacyRaw = env.PEIMA_P76_READ_PATH_FALLBACK_LEGACY;

  if (isEnvExplicit(safeRaw)) {
    return {
      safeFallbackEnabled: parseTruthy(safeRaw, true),
      deprecatedAliasUsed: false,
    };
  }
  if (isEnvExplicit(legacyRaw)) {
    return {
      safeFallbackEnabled: parseTruthy(legacyRaw, true),
      deprecatedAliasUsed: true,
    };
  }
  return {
    safeFallbackEnabled: true,
    deprecatedAliasUsed: false,
  };
}

export type P76ReadPathEnv = {
  enabled: boolean;
  viewerAllowlist: string[];
  sourceVersion: string;
  requirePmSignoff: boolean;
  requireOpsSignoff: boolean;
  /** P7.10-r2b: safe fallback to baseline display when sidecar ineligible. */
  safeFallbackEnabled: boolean;
  /**
   * @deprecated Use `safeFallbackEnabled`. Same value; kept for backward compatibility.
   */
  fallbackLegacy: boolean;
  /** True when only `PEIMA_P76_READ_PATH_FALLBACK_LEGACY` supplied the fallback value. */
  deprecatedAliasUsed: boolean;
  strictViolationBlock: boolean;
};

export function readP76ReadPathEnv(
  env: NodeJS.ProcessEnv = process.env,
): P76ReadPathEnv {
  const { safeFallbackEnabled, deprecatedAliasUsed } =
    resolveP76ReadPathSafeFallback(env);

  return {
    enabled: parseTruthy(env.PEIMA_P76_READ_PATH_ENABLED, false),
    viewerAllowlist: parseViewerAllowlist(env.PEIMA_P76_READ_PATH_VIEWER_IDS),
    sourceVersion:
      env.PEIMA_P76_READ_PATH_SOURCE_VERSION?.trim() ||
      P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    requirePmSignoff: parseTruthy(
      env.PEIMA_P76_READ_PATH_REQUIRE_PM_SIGNOFF,
      true,
    ),
    requireOpsSignoff: parseTruthy(
      env.PEIMA_P76_READ_PATH_REQUIRE_OPS_SIGNOFF,
      true,
    ),
    safeFallbackEnabled,
    fallbackLegacy: safeFallbackEnabled,
    deprecatedAliasUsed,
    strictViolationBlock: parseTruthy(
      env.PEIMA_P76_READ_PATH_STRICT_VIOLATION_BLOCK,
      true,
    ),
  };
}

export function isViewerOnP76ReadPathAllowlist(
  viewerUserId: string,
  env: P76ReadPathEnv,
): boolean {
  if (env.viewerAllowlist.length === 0) return false;
  return env.viewerAllowlist.includes(viewerUserId.trim());
}
