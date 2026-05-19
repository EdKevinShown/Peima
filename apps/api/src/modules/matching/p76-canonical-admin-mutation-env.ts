/**
 * P7.10-r8f — route-level env gates for hidden admin Apply / Rollback API.
 */

import type { P76CanonicalAdminMutationEnvV1 } from "./p76-canonical-admin-mutation.types";

const TRUTHY = new Set(["1", "true", "yes"]);
const FALSY = new Set(["0", "false", "no"]);

function parseTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return defaultValue;
}

export function normalizeP76CanonicalAdminMutationEnvironment(
  raw: string | undefined,
): string {
  const v = (raw ?? "dev").trim().toLowerCase();
  if (v === "local") return "dev";
  if (v === "production" || v === "prod" || v === "customer_production") {
    return "production";
  }
  return v;
}

export function readP76CanonicalAdminMutationEnv(
  env: NodeJS.ProcessEnv = process.env,
): P76CanonicalAdminMutationEnvV1 {
  const mutationApiEnabled = parseTruthy(
    env.PEIMA_P710_R8_HIDDEN_ADMIN_MUTATION_API_ENABLED,
    false,
  );
  const applyRouteEnabled = parseTruthy(
    env.PEIMA_P710_R8_HIDDEN_ADMIN_APPLY_ROUTE_ENABLED,
    false,
  );
  const rollbackRouteEnabled = parseTruthy(
    env.PEIMA_P710_R8_HIDDEN_ADMIN_ROLLBACK_ROUTE_ENABLED,
    false,
  );
  const configuredEnvironment = normalizeP76CanonicalAdminMutationEnvironment(
    env.PEIMA_P710_R8_HIDDEN_ADMIN_MUTATION_ENVIRONMENT,
  );
  const nodeEnv = (env.NODE_ENV ?? "development").trim().toLowerCase();

  const mutationEnvironmentAllowed =
    configuredEnvironment === "dev" ||
    configuredEnvironment === "staging" ||
    configuredEnvironment === "production-like-staging";

  const productionBlocked =
    configuredEnvironment === "production" ||
    nodeEnv === "production" ||
    configuredEnvironment === "customer_production";

  return {
    mutationApiEnabled,
    applyRouteEnabled,
    rollbackRouteEnabled,
    configuredEnvironment,
    nodeEnv,
    mutationEnvironmentAllowed,
    productionBlocked,
    canApplyRoute: mutationApiEnabled && applyRouteEnabled && !productionBlocked,
    canRollbackRoute:
      mutationApiEnabled && rollbackRouteEnabled && !productionBlocked,
  };
}

export function isP76CanonicalAdminMutationApiEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return readP76CanonicalAdminMutationEnv(env).mutationApiEnabled;
}
