/**
 * P7.10-r3f1 — env gates for canonical match result sidecar writer.
 */

import type {
  P76CanonicalMatchResultSidecarWriterBlockedReason,
  P76CanonicalMatchResultSidecarWriterEnv,
  P76CanonicalMatchResultSidecarWriterMode,
} from "./p76-canonical-match-result-sidecar-writer.types";
import { P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION } from "./p76-canonical-match-result-sidecar-writer.types";

const TRUTHY = new Set(["1", "true", "yes"]);
const FALSY = new Set(["0", "false", "no"]);

function parseTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return defaultValue;
}

function parseAllowlist(raw: string | undefined): string[] {
  if (raw == null || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function normalizeP76CanonicalMatchResultSidecarWriterEnvironment(
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

export function resolveP76CanonicalMatchResultSidecarWriterBlockedReason(
  env: Pick<
    P76CanonicalMatchResultSidecarWriterEnv,
    | "enabled"
    | "dryRun"
    | "allowDbWrite"
    | "killSwitch"
    | "environment"
    | "nodeEnv"
    | "normalizedEnvironment"
    | "canInsert"
  >,
): P76CanonicalMatchResultSidecarWriterBlockedReason | null {
  if (env.killSwitch) return "kill_switch";
  if (!env.enabled) return "disabled";
  if (env.environment === "production" || env.nodeEnv === "production") {
    return "production_blocked";
  }
  if (!isInsertEnvironment(env.normalizedEnvironment ?? "")) {
    return "invalid_environment";
  }
  if (env.canInsert) return "insert_only_not_implemented_in_r3f1";
  if (env.dryRun) return "dry_run";
  if (!env.allowDbWrite) return "db_write_not_allowed";
  return null;
}

export function resolveP76CanonicalMatchResultSidecarWriterMode(
  env: P76CanonicalMatchResultSidecarWriterEnv,
): P76CanonicalMatchResultSidecarWriterMode {
  if (env.killSwitch) return "kill_switch";
  if (!env.enabled) return "disabled";
  if (env.environment === "production" || env.nodeEnv === "production") {
    return "blocked_production";
  }
  if (!isInsertEnvironment(env.normalizedEnvironment ?? "")) {
    return "blocked_environment";
  }
  if (env.canInsert) return "insert_only_requested";
  if (env.dryRun || !env.allowDbWrite) return "dry_run";
  return "dry_run";
}

export function readP76CanonicalMatchResultSidecarWriterEnv(
  env: NodeJS.ProcessEnv = process.env,
): P76CanonicalMatchResultSidecarWriterEnv {
  const environment = normalizeP76CanonicalMatchResultSidecarWriterEnvironment(
    env.PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENVIRONMENT,
  );
  const nodeEnv = (env.NODE_ENV ?? "").trim().toLowerCase();
  const normalizedEnvironment = isInsertEnvironment(environment)
    ? environment
    : null;

  const enabled = parseTruthy(
    env.PEIMA_P76_CANONICAL_SIDECAR_WRITER_ENABLED,
    false,
  );
  const dryRun = parseTruthy(
    env.PEIMA_P76_CANONICAL_SIDECAR_WRITER_DRY_RUN,
    true,
  );
  const allowDbWrite = parseTruthy(
    env.PEIMA_P76_CANONICAL_SIDECAR_WRITER_ALLOW_DB_WRITE,
    false,
  );
  const killSwitch = parseTruthy(
    env.PEIMA_P76_CANONICAL_SIDECAR_WRITER_KILL_SWITCH,
    false,
  );

  const expectedSourceVersion =
    env.PEIMA_P76_CANONICAL_SIDECAR_WRITER_SOURCE_VERSION?.trim() ||
    P76_CANONICAL_MATCH_RESULT_SIDECAR_WRITER_SOURCE_VERSION;

  const viewerAllowlist = parseAllowlist(
    env.PEIMA_P76_CANONICAL_SIDECAR_WRITER_ALLOWLIST_VIEWER_IDS,
  );

  const canInsert =
    enabled &&
    !dryRun &&
    allowDbWrite &&
    !killSwitch &&
    normalizedEnvironment != null &&
    nodeEnv !== "production";

  const base: P76CanonicalMatchResultSidecarWriterEnv = {
    enabled,
    dryRun,
    allowDbWrite,
    killSwitch,
    environment,
    normalizedEnvironment,
    nodeEnv,
    expectedSourceVersion,
    viewerAllowlist,
    canInsert,
    blockedReason: null,
  };

  base.blockedReason = canInsert
    ? "insert_only_not_implemented_in_r3f1"
    : resolveP76CanonicalMatchResultSidecarWriterBlockedReason({
        ...base,
        canInsert: false,
      });

  return base;
}
