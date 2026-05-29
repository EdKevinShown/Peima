/**
 * P7.10-r4a — feature flag for additive GET /matching/result resultState contract.
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

export type P76ResultStateContractEnv = {
  enabled: boolean;
};

export function readP76ResultStateContractEnv(
  env: NodeJS.ProcessEnv = process.env,
): P76ResultStateContractEnv {
  return {
    enabled: parseTruthy(env.PEIMA_P76_RESULT_STATE_CONTRACT_ENABLED, false),
  };
}
