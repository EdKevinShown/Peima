/**
 * P7.6-r8g1 — pure derived status helpers (sidecar written ≠ product apply).
 */

import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "./p76-allowlist-apply-meta.types";
import type {
  P76AdminAllowlistApplyMetaAggregateV1,
  P76AdminAllowlistApplyMetaDerivedV1,
  P76AdminArtifactPathChecker,
  P76AdminMainChainApplyStatus,
  P76AdminProductApplyStatus,
  P76AdminSidecarStatus,
  P76AdminStageSummaryV1,
  P76AdminViolationStatus,
  P76AllowlistApplyMetaDbRow,
} from "./p76-admin-allowlist-apply-meta.types";

const PRIVACY_DENY_KEYS = [
  "imageUrl",
  "image_url",
  "detectionScoreJson",
  "detection_score_json",
  "effectiveProfileChatOverlayV1",
  "dimensionBranchChatHints",
  "apiKey",
  "api_key",
  "base64",
  "prompt",
  "vendorRawResponse",
  "vendor_raw_response",
] as const;

export function parseP76AdminStringIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

export function isP76MainChainViolation(row: P76AllowlistApplyMetaDbRow): boolean {
  return (
    row.appliedToMatchResult === true ||
    row.appliedToFinalScore === true ||
    row.appliedToWorkerRanking === true ||
    row.appliedToDisplay === true
  );
}

export function deriveP76SidecarStatus(
  row: P76AllowlistApplyMetaDbRow,
): P76AdminSidecarStatus {
  if (row.rolledBack) return "rolled_back";
  if (row.applied && !row.dryRun) return "written";
  return "dry_run";
}

export function deriveP76ProductApplyStatus(
  row: P76AllowlistApplyMetaDbRow,
): P76AdminProductApplyStatus {
  const notes = row.auditNotes;
  if (
    notes != null &&
    typeof notes === "object" &&
    !Array.isArray(notes) &&
    (notes as Record<string, unknown>).productApplyBlocked === true
  ) {
    return "blocked";
  }
  if (
    notes != null &&
    typeof notes === "object" &&
    !Array.isArray(notes) &&
    (notes as Record<string, unknown>).productApplyEnabled === true
  ) {
    return "future_enabled";
  }
  return "not_applied";
}

export function deriveP76MainChainApplyStatus(
  row: P76AllowlistApplyMetaDbRow,
): P76AdminMainChainApplyStatus {
  return isP76MainChainViolation(row) ? "violation_detected" : "none";
}

export function deriveP76ViolationStatus(
  row: P76AllowlistApplyMetaDbRow,
  opts?: {
    currentSourceVersion?: string;
    artifactPathChecker?: P76AdminArtifactPathChecker;
  },
): P76AdminViolationStatus {
  if (isP76MainChainViolation(row)) {
    return "p0_main_chain_flag";
  }
  if (row.rolledBack) {
    return "rolled_back";
  }
  const cohort =
    opts?.currentSourceVersion ?? P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION;
  if (row.sourceVersion !== cohort) {
    return "stale_source_version";
  }
  const checker = opts?.artifactPathChecker;
  if (checker && row.routeCArtifactPath && !checker(row.routeCArtifactPath)) {
    return "artifact_missing";
  }
  return "ok";
}

export function deriveP76AdminStatuses(
  row: P76AllowlistApplyMetaDbRow,
  opts?: {
    currentSourceVersion?: string;
    artifactPathChecker?: P76AdminArtifactPathChecker;
  },
): P76AdminAllowlistApplyMetaDerivedV1 {
  return {
    sidecarStatus: deriveP76SidecarStatus(row),
    productApplyStatus: deriveP76ProductApplyStatus(row),
    mainChainApplyStatus: deriveP76MainChainApplyStatus(row),
    violationStatus: deriveP76ViolationStatus(row, opts),
  };
}

export function buildP76StageSummary(
  row: P76AllowlistApplyMetaDbRow,
): P76AdminStageSummaryV1 {
  const stage1 = parseP76AdminStringIdArray(row.stage1SelectedCandidateIds);
  const stage2 = parseP76AdminStringIdArray(row.stage2Top2CandidateIds);
  return {
    stage1Count: stage1.length,
    stage2Count: stage2.length,
    selectedBy20DOnlyCandidateId: row.selectedBy20DOnlyCandidateId,
    selectedByRrmCandidateId: row.selectedByRrmCandidateId,
    finalShadowSelectedCandidateId: row.finalShadowSelectedCandidateId,
  };
}

export function toP76AdminSafeRow(
  row: P76AllowlistApplyMetaDbRow,
  derived: P76AdminAllowlistApplyMetaDerivedV1,
) {
  const safe = {
    ...row,
    stage1SelectedCandidateIds: parseP76AdminStringIdArray(
      row.stage1SelectedCandidateIds,
    ),
    stage2Top2CandidateIds: parseP76AdminStringIdArray(
      row.stage2Top2CandidateIds,
    ),
    auditNotes: sanitizeP76AdminAuditNotes(row.auditNotes),
    ...derived,
  };
  assertP76AdminResponsePrivacySafe(safe);
  return safe;
}

function sanitizeP76AdminAuditNotes(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      PRIVACY_DENY_KEYS.some((deny) => deny.toLowerCase() === key.toLowerCase())
    ) {
      continue;
    }
    out[key] = child;
  }
  assertP76AdminResponsePrivacySafe(out);
  return out;
}

export function assertP76AdminResponsePrivacySafe(
  value: unknown,
  path = "",
): void {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertP76AdminResponsePrivacySafe(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const full = path ? `${path}.${key}` : key;
    if (
      PRIVACY_DENY_KEYS.some(
        (deny) => deny.toLowerCase() === key.toLowerCase(),
      )
    ) {
      throw new Error(`privacy violation: forbidden key ${full}`);
    }
    assertP76AdminResponsePrivacySafe(child, full);
  }
}

export function computeP76AdminAggregate(
  rows: Array<P76AllowlistApplyMetaDbRow & P76AdminAllowlistApplyMetaDerivedV1>,
): P76AdminAllowlistApplyMetaAggregateV1 {
  let writtenRows = 0;
  let dryRunRows = 0;
  let rolledBackRows = 0;
  let violationCount = 0;
  let mainChainViolationCount = 0;
  let nonAllowlistViolationCount = 0;
  let artifactMissingCount = 0;
  let staleSourceVersionCount = 0;
  let appliedToMatchResultTrueCount = 0;
  let appliedToFinalScoreTrueCount = 0;
  let appliedToWorkerRankingTrueCount = 0;
  let appliedToDisplayTrueCount = 0;

  for (const row of rows) {
    if (row.sidecarStatus === "written") writtenRows += 1;
    if (row.sidecarStatus === "dry_run") dryRunRows += 1;
    if (row.rolledBack) rolledBackRows += 1;
    if (row.violationStatus !== "ok") violationCount += 1;
    if (row.mainChainApplyStatus === "violation_detected") {
      mainChainViolationCount += 1;
    }
    if (!row.allowlistMatched && row.sidecarStatus === "written") {
      nonAllowlistViolationCount += 1;
    }
    if (row.violationStatus === "artifact_missing") artifactMissingCount += 1;
    if (row.violationStatus === "stale_source_version") {
      staleSourceVersionCount += 1;
    }
    if (row.appliedToMatchResult) appliedToMatchResultTrueCount += 1;
    if (row.appliedToFinalScore) appliedToFinalScoreTrueCount += 1;
    if (row.appliedToWorkerRanking) appliedToWorkerRankingTrueCount += 1;
    if (row.appliedToDisplay) appliedToDisplayTrueCount += 1;
  }

  return {
    totalSidecarRows: rows.length,
    writtenRows,
    dryRunRows,
    rolledBackRows,
    violationCount,
    mainChainViolationCount,
    nonAllowlistViolationCount,
    artifactMissingCount,
    staleSourceVersionCount,
    appliedToMatchResultTrueCount,
    appliedToFinalScoreTrueCount,
    appliedToWorkerRankingTrueCount,
    appliedToDisplayTrueCount,
  };
}

export function encodeP76AdminListCursor(row: {
  createdAt: Date;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: row.createdAt.toISOString(),
      id: row.id,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeP76AdminListCursor(
  cursor: string,
): { createdAt: Date; id: string } | null {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { createdAt?: string; id?: string };
    if (!raw.createdAt || !raw.id) return null;
    const createdAt = new Date(raw.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: raw.id };
  } catch {
    return null;
  }
}

export function normalizeP76AdminListLimit(limit?: number): number {
  const n = limit ?? 50;
  if (n < 1) return 50;
  return Math.min(n, 100);
}
