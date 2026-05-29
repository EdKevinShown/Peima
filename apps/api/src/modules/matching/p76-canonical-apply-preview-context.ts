/**
 * P7.10-r7f — conservative gate context for apply-preview API (fail-closed).
 */

import type { P76CanonicalApplyPreviewInputV1 } from "./p76-canonical-apply-preview.types";

const TRUTHY = new Set(["1", "true", "yes"]);

function parseTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  return TRUTHY.has(raw.trim().toLowerCase());
}

/** Default ops context while Gate 12 / Grafana are not PASS. */
export function buildP76CanonicalApplyPreviewConservativeContext(
  env: NodeJS.ProcessEnv = process.env,
): NonNullable<P76CanonicalApplyPreviewInputV1["context"]> {
  return {
    gate12Status:
      env.PEIMA_P76_APPLY_PREVIEW_GATE12_STATUS?.trim() ||
      "STAGING_GET_MATRIX_READY_MONITORING_PENDING",
    grafanaStatus:
      env.PEIMA_P76_APPLY_PREVIEW_GRAFANA_STATUS?.trim() ||
      "P7_6_R9E3F2_BLOCKED_BY_MISSING_GRAFANA_ACCESS",
    pmSignoffRequired: parseTruthy(env.PEIMA_P76_APPLY_PREVIEW_PM_SIGNOFF_REQUIRED, true),
    opsSignoffRequired: parseTruthy(env.PEIMA_P76_APPLY_PREVIEW_OPS_SIGNOFF_REQUIRED, true),
    productionWriteRequested: parseTruthy(
      env.PEIMA_P76_APPLY_PREVIEW_PRODUCTION_WRITE_REQUESTED,
      true,
    ),
    incidentActive: parseTruthy(env.PEIMA_P76_APPLY_PREVIEW_INCIDENT_ACTIVE, false),
    percentRolloutActive: parseTruthy(env.PEIMA_P76_APPLY_PREVIEW_PERCENT_ACTIVE, false),
    workerDeployActive: parseTruthy(env.PEIMA_P76_APPLY_PREVIEW_WORKER_DEPLOY_ACTIVE, false),
  };
}
