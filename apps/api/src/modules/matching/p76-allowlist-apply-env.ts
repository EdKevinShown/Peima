/**
 * P7.6-r8b — env gate for allowlist apply sidecar writer.
 * Defaults: disabled, dry-run on, empty allowlist, PM/Ops signoff required.
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

export type P76AllowlistApplyEnv = {
  enabled: boolean;
  dryRun: boolean;
  viewerAllowlist: string[];
  poolSourceVersion: string;
  requirePmSignoff: boolean;
  requireOpsSignoff: boolean;
};

export function readP76AllowlistApplyEnv(
  env: NodeJS.ProcessEnv = process.env,
): P76AllowlistApplyEnv {
  return {
    enabled: parseTruthy(env.PEIMA_P76_ALLOWLIST_APPLY_ENABLED, false),
    dryRun: parseTruthy(env.PEIMA_P76_ALLOWLIST_APPLY_DRY_RUN, true),
    viewerAllowlist: parseViewerAllowlist(env.PEIMA_P76_ALLOWLIST_VIEWER_IDS),
    poolSourceVersion:
      env.PEIMA_P76_ALLOWLIST_POOL_SOURCE_VERSION?.trim() ||
      P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    requirePmSignoff: parseTruthy(
      env.PEIMA_P76_ALLOWLIST_REQUIRE_PM_SIGNOFF,
      true,
    ),
    requireOpsSignoff: parseTruthy(
      env.PEIMA_P76_ALLOWLIST_REQUIRE_OPS_SIGNOFF,
      true,
    ),
  };
}

export function isViewerOnP76Allowlist(
  viewerUserId: string,
  env: P76AllowlistApplyEnv,
): boolean {
  if (env.viewerAllowlist.length === 0) return false;
  return env.viewerAllowlist.includes(viewerUserId.trim());
}
