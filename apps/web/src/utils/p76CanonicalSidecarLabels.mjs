/**
 * P7.7-r4.3 — labels for canonical match result sidecar admin UI.
 */

const PROMOTION_LABELS = {
  not_promoted: "not_promoted",
  promoted: "promoted",
  rolled_back: "rolled_back",
  blocked: "blocked",
};

const MODE_LABELS = {
  dry_run: "dry_run",
  sidecar: "sidecar",
  promoted: "promoted",
};

export function getCanonicalSidecarPromotionStatusLabel(status) {
  if (status == null || status === "") return "—";
  return PROMOTION_LABELS[status] ?? String(status);
}

export function getCanonicalSidecarModeLabel(mode) {
  if (mode == null || mode === "") return "—";
  return MODE_LABELS[mode] ?? String(mode);
}

/**
 * @param {boolean} value
 * @param {"matchResult"|"finalScore"|"workerRanking"} context
 * @param {string} [promotionStatus]
 */
export function getCanonicalSidecarAppliedFlagLabel(
  value,
  context,
  promotionStatus = "not_promoted",
) {
  if (value === false) {
    return `${context}: false (safe)`;
  }
  if (value === true && promotionStatus !== "promoted") {
    return `${context}: true (P0 violation)`;
  }
  if (value === true) {
    return `${context}: true (warning)`;
  }
  return `${context}: ${String(value)}`;
}

export function appliedFlagTone(value, promotionStatus = "not_promoted") {
  if (value === false) return "ok";
  if (value === true && promotionStatus !== "promoted") return "p0";
  if (value === true) return "warning";
  return "ok";
}

export function getCanonicalSidecarSafetyLabel(item) {
  if (!item) return "—";
  if (item.deletedAt) return "Deleted";
  if (item.supersededAt) return "Superseded";
  if (item.rolledBack) return "Rolled back";
  if (item.appliedToWorkerRanking === true) return "P0 violation";
  if (
    item.appliedToMatchResult === true &&
    item.promotionStatus !== "promoted"
  ) {
    return "P0 violation";
  }
  if (item.appliedToFinalScore === true && item.promotionStatus !== "promoted") {
    return "P0 violation";
  }
  if (item.safety?.isSidecarOnly) return "Sidecar only";
  if (
    item.safety?.notAppliedToMatchResult &&
    item.safety?.notAppliedToFinalScore &&
    item.safety?.notAppliedToWorkerRanking
  ) {
    return "Not applied";
  }
  return "Review";
}

export function safetyBadgeTone(item) {
  const label = getCanonicalSidecarSafetyLabel(item);
  if (label === "P0 violation") return "p0";
  if (label === "Rolled back" || label === "Deleted" || label === "Superseded") {
    return "muted";
  }
  if (label === "Sidecar only" || label === "Not applied") return "ok";
  return "neutral";
}

export function hasCanonicalSidecarRowP0Violation(row) {
  if (!row) return false;
  if (row.appliedToWorkerRanking === true) return true;
  if (row.appliedToMatchResult === true && row.promotionStatus !== "promoted") {
    return true;
  }
  if (row.appliedToFinalScore === true && row.promotionStatus !== "promoted") {
    return true;
  }
  return false;
}

export function hasCanonicalSidecarP0Violation(aggregateOrRow) {
  if (!aggregateOrRow) return false;
  if (typeof aggregateOrRow.appliedToMatchResultViolationCount === "number") {
    return (
      aggregateOrRow.appliedToMatchResultViolationCount > 0 ||
      aggregateOrRow.appliedToFinalScoreViolationCount > 0 ||
      aggregateOrRow.appliedToWorkerRankingViolationCount > 0
    );
  }
  return hasCanonicalSidecarRowP0Violation(aggregateOrRow);
}
