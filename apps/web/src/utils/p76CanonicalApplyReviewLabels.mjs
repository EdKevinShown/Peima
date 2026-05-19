/**
 * P7.10-r7i — labels for canonical apply review (read-only) admin UI.
 */

/** @type {readonly string[]} */
export const FORBIDDEN_UI_COPY = [
  "Production apply ready",
  "Final replacement",
  "Worker winner",
  "Percent rollout",
  "Legacy removed",
  "MatchResult updated",
];

/** Actions that must never appear as enabled controls on r7i. */
export const FORBIDDEN_ACTION_LABELS = ["Apply", "Rollback", "Promote", "Write MatchResult"];

/** @type {readonly string[]} */
export const ALLOWED_ACTION_LABELS = [
  "Refresh",
  "Back to sidecar list",
  "Copy review summary",
];

const BLOCKED_REASON_LABELS = {
  missing_sidecar: "Sidecar missing",
  missing_sidecar_id: "Sidecar id missing",
  missing_match_result: "MatchResult missing",
  viewer_mismatch: "Viewer mismatch",
  missing_selected_candidate: "Selected candidate missing",
  score_missing: "Score missing",
  sidecar_already_promoted: "Already promoted",
  sidecar_rolled_back: "Sidecar rolled back",
  sidecar_deleted: "Sidecar deleted",
  sidecar_superseded: "Sidecar superseded",
  sidecar_applied_to_worker_ranking: "Applied to worker ranking (P0)",
  sidecar_applied_to_match_result: "Applied to MatchResult (P0)",
  sidecar_applied_to_final_score: "Applied to finalScore (P0)",
  unsafe_environment: "Unsafe environment",
  gate12_not_final: "Blocked by Gate 12",
  grafana_blocked: "Grafana pending",
  pm_signoff_missing: "PM signoff missing",
  ops_signoff_missing: "Ops signoff missing",
  incident_active: "Incident active",
  percent_rollout_active: "Percent rollout active",
  worker_deploy_active: "Worker deploy active",
  production_write_blocked: "Production write blocked",
  missing_current_match_result: "MatchResult missing (snapshot)",
  preview_not_ready: "Apply preview not ready",
};

const SNAPSHOT_BLOCKED_REASON_LABELS = {
  ...BLOCKED_REASON_LABELS,
};

const SAFETY_KEYS = [
  "writesDb",
  "writesMatchResult",
  "writesFinalScore",
  "triggersWorker",
  "changesPercent",
  "productionRollout",
];

/**
 * @param {string | null | undefined} reason
 */
export function getBlockedReasonLabel(reason) {
  if (reason == null || reason === "") return "—";
  return SNAPSHOT_BLOCKED_REASON_LABELS[reason] ?? String(reason);
}

/**
 * @param {boolean | undefined} snapshotReady
 */
export function getSnapshotReadyLabel(snapshotReady) {
  if (snapshotReady === true) return "Snapshot ready (dry-run)";
  if (snapshotReady === false) return "Snapshot blocked (dry-run)";
  return "Snapshot unavailable";
}

/**
 * Dry-run badge for rollback snapshot preview (r7j).
 */
export function getRollbackSnapshotDryRunBadge() {
  return "Dry-run snapshot";
}

/**
 * @param {string | null | undefined} message
 */
export function isRollbackSnapshotApiUnavailable(message) {
  const m = (message || "").toLowerCase();
  if (!m) return false;
  return (
    m.includes("401") ||
    m.includes("403") ||
    m.includes("404") ||
    m.includes("无权限") ||
    m.includes("登录已失效") ||
    m.includes("功能未启用") ||
    m.includes("记录不存在") ||
    m.includes("unavailable") ||
    m.includes("网络异常")
  );
}

/**
 * @param {boolean} canApply
 * @param {string[]} [blockedReasons]
 */
export function getCanApplySummaryLabel(canApply, blockedReasons = []) {
  if (canApply === true) {
    return "Apply hidden until P7.10-r8 + Gate 12 + Grafana + PM/Ops signoff";
  }
  if (blockedReasons.length > 0) {
    return "Preview only — apply blocked";
  }
  return "Preview only — apply blocked";
}

/**
 * @param {boolean} canApply
 */
export function canApplyTone(canApply) {
  return canApply === true ? "warning" : "blocked";
}

/**
 * All safety flags must be strictly false for no-write verified.
 * @param {Record<string, boolean> | null | undefined} safety
 */
export function isNoWriteSafetyVerified(safety) {
  if (!safety || typeof safety !== "object") return false;
  return SAFETY_KEYS.every((key) => safety[key] === false);
}

/**
 * @param {Record<string, boolean> | null | undefined} safety
 */
export function getNoWriteSafetyLabel(safety) {
  if (isNoWriteSafetyVerified(safety)) return "No-write verified";
  return "P0: no-write safety violation";
}

/**
 * @param {string | null | undefined} tokenPreview
 */
export function getRollbackTokenDisplay(tokenPreview) {
  if (tokenPreview == null || tokenPreview === "") return "redacted";
  return "redacted";
}

/**
 * @param {Record<string, boolean> | null | undefined} safety
 */
export function getSafetyFlagRows(safety) {
  if (!safety || typeof safety !== "object") {
    return SAFETY_KEYS.map((key) => ({ key, value: undefined, ok: false }));
  }
  return SAFETY_KEYS.map((key) => ({
    key,
    value: safety[key],
    ok: safety[key] === false,
  }));
}

/**
 * @param {string} label
 */
export function isForbiddenUiCopy(label) {
  return FORBIDDEN_UI_COPY.some(
    (f) => f.toLowerCase() === String(label).trim().toLowerCase(),
  );
}

/**
 * @param {string} label
 */
export function isForbiddenActionLabel(label) {
  return FORBIDDEN_ACTION_LABELS.some(
    (f) => f.toLowerCase() === String(label).trim().toLowerCase(),
  );
}

/**
 * @param {string} label
 */
export function isAllowedActionLabel(label) {
  return ALLOWED_ACTION_LABELS.some(
    (a) => a.toLowerCase() === String(label).trim().toLowerCase(),
  );
}

/**
 * @param {boolean | undefined} value
 */
export function proposedChangeLabel(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}
