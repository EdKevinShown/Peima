/**
 * P7.6-r8h1 — env gate for P7.6 allowlist sidecar read path / display overlay.
 * Defaults: disabled, empty allowlist, PM/Ops signoff required, fallback legacy, strict violation block.
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

export type P76ReadPathEnv = {
  enabled: boolean;
  viewerAllowlist: string[];
  sourceVersion: string;
  requirePmSignoff: boolean;
  requireOpsSignoff: boolean;
  fallbackLegacy: boolean;
  strictViolationBlock: boolean;
};

export function readP76ReadPathEnv(
  env: NodeJS.ProcessEnv = process.env,
): P76ReadPathEnv {
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
    fallbackLegacy: parseTruthy(env.PEIMA_P76_READ_PATH_FALLBACK_LEGACY, true),
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
