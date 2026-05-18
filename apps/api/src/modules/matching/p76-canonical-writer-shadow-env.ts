/**
 * P7.10-r6 — env gate for P7.6 canonical writer shadow (compare only; no MatchResult writes).
 */

const TRUTHY = new Set(["1", "true", "yes"]);
const FALSY = new Set(["0", "false", "no"]);

function parseTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return defaultValue;
}

export type P76CanonicalWriterShadowEnv = {
  enabled: boolean;
};

export function readP76CanonicalWriterShadowEnv(
  env: NodeJS.ProcessEnv = process.env,
): P76CanonicalWriterShadowEnv {
  return {
    enabled: parseTruthy(env.PEIMA_P76_CANONICAL_WRITER_SHADOW_ENABLED, false),
  };
}
