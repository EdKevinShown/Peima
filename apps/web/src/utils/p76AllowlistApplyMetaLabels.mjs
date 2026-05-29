/** @typedef {import('../api/p76AdminAllowlistApplyMeta.ts').P76AdminAllowlistApplyMetaRow} Row */

/**
 * P7.6-r8g2 — display labels (sidecar written ≠ production apply).
 */

export function labelSidecarStatus(status) {
  if (status === "written") return "Sidecar written";
  if (status === "rolled_back") return "Rolled back";
  if (status === "dry_run") return "Dry run";
  return String(status ?? "—");
}

export function labelProductApplyStatus(status) {
  if (status === "not_applied") return "Not product-applied";
  if (status === "blocked") return "Product apply blocked";
  if (status === "future_enabled") return "Future enabled (not live)";
  return String(status ?? "—");
}

export function labelMainChainApplyStatus(status) {
  if (status === "violation_detected") return "Violation detected";
  if (status === "none") return "None";
  return String(status ?? "—");
}

export function labelViolationStatus(status) {
  const map = {
    ok: "OK",
    p0_main_chain_flag: "P0 main-chain flag",
    rolled_back: "Rolled back",
    artifact_missing: "Artifact missing",
    stale_source_version: "Stale source version",
  };
  return map[status] ?? String(status ?? "—");
}

/** @param {Row | null | undefined} row */
export function hasMainChainP0(row) {
  if (!row) return false;
  return (
    row.appliedToMatchResult === true ||
    row.appliedToFinalScore === true ||
    row.appliedToWorkerRanking === true ||
    row.appliedToDisplay === true ||
    row.mainChainApplyStatus === "violation_detected" ||
    row.violationStatus === "p0_main_chain_flag"
  );
}

/** @param {Row | null | undefined} row */
export function hasNonAllowlistP0(row) {
  return row?.allowlistMatched === false;
}

/** @param {string} violationStatus */
export function violationTone(violationStatus) {
  if (violationStatus === "p0_main_chain_flag") return "p0";
  if (violationStatus === "ok") return "ok";
  return "warning";
}

/** @param {string} sidecarStatus */
export function sidecarMustNotReadAsProduction(sidecarStatus) {
  const label = labelSidecarStatus(sidecarStatus);
  const forbidden = [
    "上线成功",
    "已应用到用户",
    "Production applied",
    "已上线",
  ];
  return !forbidden.some((f) => label.includes(f));
}
