/**
 * P7.10-r8f — gate mapping + response sanitization for hidden admin mutations.
 */

import {
  P76_CANONICAL_APPLY_GATE12_PASS,
  P76_CANONICAL_APPLY_GRAFANA_PASS,
  type P76CanonicalApplyGateContextV1,
  type P76CanonicalApplyResultV1,
} from "./p76-canonical-apply.types";
import {
  P76_CANONICAL_ADMIN_MUTATION_API_SCHEMA_VERSION,
  P76_CANONICAL_ADMIN_MUTATION_API_SOURCE_TYPE,
  P76_CANONICAL_ADMIN_MUTATION_API_SOURCE_VERSION,
  type P76CanonicalAdminMutationGateContextBodyV1,
  type P76CanonicalAdminMutationBlockedResponseV1,
  type P76CanonicalAdminMutationRouteBlockedReason,
} from "./p76-canonical-admin-mutation.types";
import {
  P76_CANONICAL_ROLLBACK_GATE12_PASS,
  P76_CANONICAL_ROLLBACK_GRAFANA_PASS,
  type P76CanonicalRollbackGateContextV1,
  type P76CanonicalRollbackResultV1,
} from "./p76-canonical-rollback.types";

const FORBIDDEN_JSON_KEYS = new Set([
  "rollbacktokenplaintext",
  "rollbacktoken",
  "database_url",
  "jwt_secret",
  "bearer",
  "apikey",
  "api_key",
  "rawprompt",
  "raw_prompt",
  "secret",
  "authorization",
]);

function signoffFromBoolean(approved: boolean): string {
  return approved ? "approved" : "pending";
}

export function mapP76AdminMutationGateContextToApply(
  body: P76CanonicalAdminMutationGateContextBodyV1,
): P76CanonicalApplyGateContextV1 {
  return {
    gate12Status: body.gate12Final
      ? P76_CANONICAL_APPLY_GATE12_PASS
      : "NEED_GATE12_FINAL",
    grafanaStatus: body.grafanaReady
      ? P76_CANONICAL_APPLY_GRAFANA_PASS
      : "NEED_GRAFANA_IMPORT",
    pmSignoffStatus: signoffFromBoolean(body.pmSignoff),
    opsSignoffStatus: signoffFromBoolean(body.opsSignoff),
    engineeringSignoffStatus: signoffFromBoolean(body.engSignoff),
    incidentActive: body.activeIncident,
    workerDeployActive: body.activeWorkerDeploy,
    percentRolloutActive: body.percent > 0,
  };
}

export function mapP76AdminMutationGateContextToRollback(
  body: P76CanonicalAdminMutationGateContextBodyV1,
): P76CanonicalRollbackGateContextV1 {
  return {
    gate12Status: body.gate12Final
      ? P76_CANONICAL_ROLLBACK_GATE12_PASS
      : "NEED_GATE12_FINAL",
    grafanaStatus: body.grafanaReady
      ? P76_CANONICAL_ROLLBACK_GRAFANA_PASS
      : "NEED_GRAFANA_IMPORT",
    pmSignoffStatus: signoffFromBoolean(body.pmSignoff),
    opsSignoffStatus: signoffFromBoolean(body.opsSignoff),
    engineeringSignoffStatus: signoffFromBoolean(body.engSignoff),
    incidentActive: body.activeIncident,
    workerDeployActive: body.activeWorkerDeploy,
    percentRolloutActive: body.percent > 0,
  };
}

export function isP76AdminMutationProductionEnvironment(environment: string): boolean {
  const v = environment.trim().toLowerCase();
  return v === "production" || v === "prod" || v === "customer_production";
}

export function buildP76AdminMutationRouteBlockedResponse(
  sidecarId: string,
  blockedReasons: P76CanonicalAdminMutationRouteBlockedReason[],
  partial?: { snapshotId?: string; matchResultId?: string },
): P76CanonicalAdminMutationBlockedResponseV1 {
  return {
    schemaVersion: P76_CANONICAL_ADMIN_MUTATION_API_SCHEMA_VERSION,
    sourceType: P76_CANONICAL_ADMIN_MUTATION_API_SOURCE_TYPE,
    sourceVersion: P76_CANONICAL_ADMIN_MUTATION_API_SOURCE_VERSION,
    mode: "blocked",
    applied: false,
    rolledBack: false,
    blockedReasons,
    sidecarId,
    snapshotId: partial?.snapshotId,
    matchResultId: partial?.matchResultId,
    safety: {
      writesDb: false,
      triggersWorker: false,
      changesPercent: false,
      productionRollout: false,
    },
  };
}

function redactForbiddenKeys(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactForbiddenKeys(item));
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_JSON_KEYS.has(key.toLowerCase())) continue;
    out[key] = redactForbiddenKeys(child);
  }
  return out;
}

export function sanitizeP76CanonicalApplyApiResponse(
  result: P76CanonicalApplyResultV1,
): Record<string, unknown> {
  return redactForbiddenKeys(result) as Record<string, unknown>;
}

export function sanitizeP76CanonicalRollbackApiResponse(
  result: P76CanonicalRollbackResultV1,
): Record<string, unknown> {
  return redactForbiddenKeys(result) as Record<string, unknown>;
}

/** Redact token fields from request bodies before logging. */
export function redactP76AdminMutationBodyForLogs(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return redactForbiddenKeys(body) as Record<string, unknown>;
}

export function responseJsonExcludesSensitiveSecrets(json: string): boolean {
  const lower = json.toLowerCase();
  const forbidden = [
    "rollbacktokenplaintext",
    "database_url",
    "jwt_secret",
    "bearer ",
    "apikey",
    "api_key",
  ];
  return !forbidden.some((needle) => lower.includes(needle));
}
