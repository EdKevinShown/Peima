/**
 * P7.7-r4.1 — feature gate for canonical match result sidecar admin read API.
 */

const TRUTHY = new Set(["1", "true", "yes"]);

function parseTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  return defaultValue;
}

export function readP76CanonicalSidecarAdminEnv(
  env: NodeJS.ProcessEnv = process.env,
): { enabled: boolean } {
  return {
    enabled: parseTruthy(env.PEIMA_P76_CANONICAL_SIDECAR_ADMIN_ENABLED, false),
  };
}

export function isP76CanonicalSidecarAdminEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return readP76CanonicalSidecarAdminEnv(env).enabled;
}
