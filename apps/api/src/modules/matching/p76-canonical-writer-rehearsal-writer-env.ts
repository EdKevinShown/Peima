/**
 * P7.10-r6f1 — env gates for rehearsal sidecar writer.
 */

import type {
  P76RehearsalSidecarWriterBlockedReason,
  P76RehearsalSidecarWriterEnv,
  P76RehearsalSidecarWriterMode,
} from "./p76-canonical-writer-rehearsal-writer.types";

const TRUTHY = new Set(["1", "true", "yes"]);
const FALSY = new Set(["0", "false", "no"]);

function parseTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return defaultValue;
}

export function normalizeP76RehearsalSidecarWriterEnvironment(
  raw: string | undefined,
): "dev" | "staging" | "production" | string {
  const v = (raw ?? "dev").trim().toLowerCase();
  if (v === "local") return "dev";
  if (v === "dev" || v === "staging" || v === "production") return v;
  return v;
}

function isInsertEnvironment(
  environment: string,
): environment is "dev" | "staging" {
  return environment === "dev" || environment === "staging";
}

export function resolveP76RehearsalSidecarWriterBlockedReason(
  env: Pick<
    P76RehearsalSidecarWriterEnv,
    | "enabled"
    | "dryRun"
    | "allowDbWrite"
    | "killSwitch"
    | "environment"
    | "nodeEnv"
    | "normalizedEnvironment"
  >,
): P76RehearsalSidecarWriterBlockedReason | null {
  if (env.killSwitch) return "kill_switch";
  if (!env.enabled) return "disabled";
  if (
    env.environment === "production" ||
    env.nodeEnv === "production" ||
    !isInsertEnvironment(env.normalizedEnvironment ?? "")
  ) {
    if (
      env.environment === "production" ||
      env.nodeEnv === "production"
    ) {
      return "production_blocked";
    }
    return "invalid_environment";
  }
  if (env.dryRun) return "dry_run";
  if (!env.allowDbWrite) return "db_write_not_allowed";
  return null;
}

export function resolveP76RehearsalSidecarWriterMode(
  env: P76RehearsalSidecarWriterEnv,
): P76RehearsalSidecarWriterMode {
  if (env.killSwitch) return "kill_switch";
  if (!env.enabled) return "disabled";
  if (
    env.environment === "production" ||
    env.nodeEnv === "production"
  ) {
    return "blocked_production";
  }
  if (!isInsertEnvironment(env.normalizedEnvironment ?? "")) {
    return "blocked_production";
  }
  if (env.canInsert) return "insert_only";
  if (env.dryRun || !env.allowDbWrite) return "dry_run";
  return "dry_run";
}

export function readP76RehearsalSidecarWriterEnv(
  env: NodeJS.ProcessEnv = process.env,
): P76RehearsalSidecarWriterEnv {
  const environment = normalizeP76RehearsalSidecarWriterEnvironment(
    env.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENVIRONMENT,
  );
  const nodeEnv = (env.NODE_ENV ?? "").trim().toLowerCase();
  const normalizedEnvironment = isInsertEnvironment(environment)
    ? environment
    : null;

  const enabled = parseTruthy(
    env.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ENABLED,
    false,
  );
  const dryRun = parseTruthy(
    env.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_DRY_RUN,
    true,
  );
  const allowDbWrite = parseTruthy(
    env.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_ALLOW_DB_WRITE,
    false,
  );
  const killSwitch = parseTruthy(
    env.PEIMA_P76_REHEARSAL_SIDECAR_WRITER_KILL_SWITCH,
    false,
  );

  const base: P76RehearsalSidecarWriterEnv = {
    enabled,
    dryRun,
    environment,
    allowDbWrite,
    killSwitch,
    canInsert: false,
    blockedReason: null,
    nodeEnv,
    normalizedEnvironment,
  };

  const canInsert =
    enabled &&
    !dryRun &&
    allowDbWrite &&
    !killSwitch &&
    normalizedEnvironment != null &&
    nodeEnv !== "production";

  base.canInsert = canInsert;
  base.blockedReason = canInsert
    ? null
    : resolveP76RehearsalSidecarWriterBlockedReason(base);

  return base;
}
