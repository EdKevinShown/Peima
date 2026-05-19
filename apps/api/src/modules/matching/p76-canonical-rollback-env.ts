/**
 * P7.10-r8e — env gates for canonical Apply rollback (default hard-disabled).
 */

import type { P76CanonicalRollbackEnvV1 } from "./p76-canonical-rollback.types";

const TRUTHY = new Set(["1", "true", "yes"]);
const FALSY = new Set(["0", "false", "no"]);

function parseTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return defaultValue;
}

export function normalizeP76CanonicalRollbackEnvironment(
  raw: string | undefined,
): string {
  const v = (raw ?? "dev").trim().toLowerCase();
  if (v === "local") return "dev";
  if (v === "production" || v === "prod" || v === "customer_production") {
    return "production";
  }
  return v;
}

export function readP76CanonicalRollbackEnv(
  env: NodeJS.ProcessEnv = process.env,
): P76CanonicalRollbackEnvV1 {
  const executionEnabled = parseTruthy(
    env.PEIMA_P710_R8_ROLLBACK_EXECUTION_ENABLED,
    false,
  );
  const allowDbWrite = parseTruthy(env.PEIMA_P710_R8_ROLLBACK_ALLOW_DB_WRITE, false);
  const requireToken = parseTruthy(env.PEIMA_P710_R8_ROLLBACK_REQUIRE_TOKEN, true);
  const configuredEnvironment = normalizeP76CanonicalRollbackEnvironment(
    env.PEIMA_P710_R8_ROLLBACK_ENVIRONMENT,
  );
  const nodeEnv = (env.NODE_ENV ?? "development").trim().toLowerCase();
  const productionPercent = Number(env.PEIMA_P76_PRODUCTION_PERCENT ?? "0");
  const percentEnabled = parseTruthy(env.PEIMA_P76_PRODUCTION_PERCENT_ENABLED, false);

  const rollbackEnvironmentAllowed =
    configuredEnvironment === "dev" ||
    configuredEnvironment === "staging" ||
    configuredEnvironment === "production-like-staging";

  const productionBlocked =
    configuredEnvironment === "production" ||
    nodeEnv === "production" ||
    configuredEnvironment === "customer_production";

  const canExecute =
    executionEnabled &&
    allowDbWrite &&
    requireToken &&
    rollbackEnvironmentAllowed &&
    !productionBlocked &&
    !percentEnabled &&
    (Number.isFinite(productionPercent) ? productionPercent <= 0 : true);

  return {
    executionEnabled,
    allowDbWrite,
    requireToken,
    configuredEnvironment,
    nodeEnv,
    productionPercent: Number.isFinite(productionPercent) ? productionPercent : 0,
    percentEnabled,
    rollbackEnvironmentAllowed,
    productionBlocked,
    canExecute,
  };
}
