/**
 * P7.7-r3.1 — feature gate for canonical rehearsal admin read API.
 */

const TRUTHY = new Set(["1", "true", "yes"]);

function parseTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  return defaultValue;
}

export function readP76RehearsalAdminEnv(
  env: NodeJS.ProcessEnv = process.env,
): { enabled: boolean } {
  return {
    enabled: parseTruthy(env.PEIMA_P76_REHEARSAL_ADMIN_ENABLED, false),
  };
}

export function isP76RehearsalAdminEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return readP76RehearsalAdminEnv(env).enabled;
}
