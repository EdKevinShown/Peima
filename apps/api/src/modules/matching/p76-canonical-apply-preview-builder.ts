/**
 * P7.10-r7d — pure Admin Apply preview payload builder (no DB / MatchResult writes).
 */

import {
  P76_CANONICAL_APPLY_PREVIEW_SCHEMA_VERSION,
  P76_CANONICAL_APPLY_PREVIEW_SOURCE_TYPE,
  P76_CANONICAL_APPLY_PREVIEW_SOURCE_VERSION,
  type P76CanonicalApplyPreviewBlockedReason,
  type P76CanonicalApplyPreviewGateResultV1,
  type P76CanonicalApplyPreviewInputV1,
  type P76CanonicalApplyPreviewMatchResultSnapshotV1,
  type P76CanonicalApplyPreviewPayloadV1,
  type P76CanonicalApplyPreviewProposedChangeV1,
  type P76CanonicalApplyPreviewSidecarSnapshotV1,
} from "./p76-canonical-apply-preview.types";

const GATE12_PASS_STATUSES = new Set(["PASS", "GATE12_PASS", "FINAL", "SIGNED_OFF"]);

const SAFE_PREVIEW_ENVIRONMENTS = new Set(["dev", "staging", "local", "test"]);

const SIGNOFF_APPROVED = "approved";

function normalizeId(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function isTimestampSet(value: string | Date | null | undefined): boolean {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return String(value).trim().length > 0;
}

function toIsoOrNull(value: string | Date | null | undefined): string | null {
  if (!isTimestampSet(value)) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function isProductionLikeEnvironment(environment: string): boolean {
  const env = environment.trim().toLowerCase();
  return env === "production" || env === "prod" || env === "customer_production";
}

function isSignoffApproved(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === SIGNOFF_APPROVED;
}

function gate(
  id: string,
  pass: boolean,
  blockedReason?: P76CanonicalApplyPreviewBlockedReason,
): P76CanonicalApplyPreviewGateResultV1 {
  return pass ? { id, pass: true } : { id, pass: false, blockedReason };
}

function buildSidecarSnapshot(
  input: P76CanonicalApplyPreviewInputV1,
): P76CanonicalApplyPreviewSidecarSnapshotV1 | null {
  const sidecar = input.sidecar;
  if (!sidecar) return null;
  return {
    id: normalizeId(sidecar.id),
    auditRunId: normalizeId(sidecar.auditRunId),
    environment: sidecar.environment?.trim() || "unknown",
    viewerUserId: normalizeId(sidecar.viewerUserId),
    matchResultId: sidecar.matchResultId != null ? normalizeId(sidecar.matchResultId) || null : null,
    selectedCandidateId:
      sidecar.selectedCandidateId != null
        ? normalizeId(sidecar.selectedCandidateId) || null
        : null,
    score:
      sidecar.score != null && Number.isFinite(sidecar.score) ? sidecar.score : null,
    reasonSummary: sidecar.reasonSummary?.trim() || null,
    sourceVersion: sidecar.sourceVersion?.trim() || null,
    promotionStatus: sidecar.promotionStatus?.trim() || null,
    appliedToMatchResult: sidecar.appliedToMatchResult === true,
    appliedToFinalScore: sidecar.appliedToFinalScore === true,
    appliedToWorkerRanking: sidecar.appliedToWorkerRanking === true,
    rolledBack: sidecar.rolledBack === true,
    deletedAt: toIsoOrNull(sidecar.deletedAt),
    supersededAt: toIsoOrNull(sidecar.supersededAt),
    pmSignoffStatus: sidecar.pmSignoffStatus?.trim() || null,
    opsSignoffStatus: sidecar.opsSignoffStatus?.trim() || null,
  };
}

function buildMatchResultSnapshot(
  input: P76CanonicalApplyPreviewInputV1,
): P76CanonicalApplyPreviewMatchResultSnapshotV1 | null {
  const mr = input.currentMatchResult;
  if (!mr) return null;
  const matchInsights = mr.matchInsights;
  const hasMatchInsights =
    matchInsights != null &&
    (typeof matchInsights !== "object" ||
      Array.isArray(matchInsights) ||
      Object.keys(matchInsights as object).length > 0);
  return {
    id: normalizeId(mr.id),
    viewerUserId: normalizeId(mr.viewerUserId),
    candidateUserId:
      mr.candidateUserId != null ? normalizeId(mr.candidateUserId) || null : null,
    finalScore:
      mr.finalScore != null && Number.isFinite(mr.finalScore) ? mr.finalScore : null,
    reasonSummary: mr.reasonSummary?.trim() || null,
    hasMatchInsights,
  };
}

function buildProposedChange(
  sidecar: P76CanonicalApplyPreviewSidecarSnapshotV1 | null,
  current: P76CanonicalApplyPreviewMatchResultSnapshotV1 | null,
): P76CanonicalApplyPreviewProposedChangeV1 {
  const proposedCandidate = sidecar?.selectedCandidateId ?? null;
  const currentCandidate = current?.candidateUserId ?? null;
  const proposedScore = sidecar?.score ?? null;
  const currentScore = current?.finalScore ?? null;

  const candidateWouldChange =
    proposedCandidate != null &&
    currentCandidate != null &&
    proposedCandidate !== currentCandidate;

  const scoreWouldChange =
    proposedScore != null &&
    currentScore != null &&
    proposedScore !== currentScore;

  const proposedReason = sidecar?.reasonSummary ?? null;
  const currentReason = current?.reasonSummary ?? null;
  const reasonSummaryWouldChange =
    proposedReason != null &&
    currentReason != null &&
    proposedReason !== currentReason;

  const displayWouldChange = candidateWouldChange || scoreWouldChange;

  return {
    candidateWouldChange,
    scoreWouldChange,
    reasonSummaryWouldChange,
    displayWouldChange,
  };
}

export function evaluateP76CanonicalApplyPreviewGates(
  input: P76CanonicalApplyPreviewInputV1,
): P76CanonicalApplyPreviewGateResultV1[] {
  const sidecar = input.sidecar;
  const sidecarSnap = buildSidecarSnapshot(input);
  const matchSnap = buildMatchResultSnapshot(input);
  const ctx = input.context ?? {};

  const results: P76CanonicalApplyPreviewGateResultV1[] = [];

  results.push(
    gate("missing_sidecar", sidecar != null, "missing_sidecar"),
  );

  const sidecarId = normalizeId(sidecar?.id);
  results.push(
    gate("missing_sidecar_id", sidecar != null && sidecarId.length > 0, "missing_sidecar_id"),
  );

  const matchResultId = normalizeId(sidecar?.matchResultId ?? undefined);
  const hasMatchResult =
    matchSnap != null &&
    matchSnap.id.length > 0 &&
    matchResultId.length > 0 &&
    matchSnap.id === matchResultId;
  results.push(
    gate("missing_match_result", hasMatchResult, "missing_match_result"),
  );

  const viewerOk =
    sidecarSnap != null &&
    matchSnap != null &&
    sidecarSnap.viewerUserId.length > 0 &&
    matchSnap.viewerUserId.length > 0 &&
    sidecarSnap.viewerUserId === matchSnap.viewerUserId;
  results.push(gate("viewer_mismatch", viewerOk, "viewer_mismatch"));

  const selectedCandidate = normalizeId(sidecar?.selectedCandidateId ?? undefined);
  results.push(
    gate(
      "missing_selected_candidate",
      selectedCandidate.length > 0,
      "missing_selected_candidate",
    ),
  );

  const scoreFinite = sidecar?.score != null && Number.isFinite(sidecar.score);
  results.push(gate("score_missing", scoreFinite, "score_missing"));

  const notPromoted =
    (sidecar?.promotionStatus ?? "not_promoted").trim().toLowerCase() !== "promoted";
  results.push(
    gate("sidecar_already_promoted", notPromoted, "sidecar_already_promoted"),
  );

  results.push(
    gate("sidecar_rolled_back", sidecar?.rolledBack !== true, "sidecar_rolled_back"),
  );

  results.push(
    gate("sidecar_deleted", !isTimestampSet(sidecar?.deletedAt), "sidecar_deleted"),
  );

  results.push(
    gate("sidecar_superseded", !isTimestampSet(sidecar?.supersededAt), "sidecar_superseded"),
  );

  results.push(
    gate(
      "sidecar_applied_to_worker_ranking",
      sidecar?.appliedToWorkerRanking !== true,
      "sidecar_applied_to_worker_ranking",
    ),
  );

  results.push(
    gate(
      "sidecar_applied_to_match_result",
      sidecar?.appliedToMatchResult !== true,
      "sidecar_applied_to_match_result",
    ),
  );

  results.push(
    gate(
      "sidecar_applied_to_final_score",
      sidecar?.appliedToFinalScore !== true,
      "sidecar_applied_to_final_score",
    ),
  );

  const environment = sidecar?.environment?.trim() ?? "";
  const envSafe =
    environment.length > 0 &&
    (SAFE_PREVIEW_ENVIRONMENTS.has(environment.toLowerCase()) ||
      !isProductionLikeEnvironment(environment));
  results.push(gate("unsafe_environment", envSafe, "unsafe_environment"));

  const gate12Status = (ctx.gate12Status ?? "").trim().toUpperCase();
  const gate12Ok = GATE12_PASS_STATUSES.has(gate12Status);
  results.push(gate("gate12_not_final", gate12Ok, "gate12_not_final"));

  const grafanaStatus = (ctx.grafanaStatus ?? "").trim();
  const grafanaOk =
    grafanaStatus.length > 0 &&
    !grafanaStatus.toUpperCase().includes("BLOCKED") &&
    grafanaStatus !== "P7_6_R9E3F2_BLOCKED_BY_MISSING_GRAFANA_ACCESS";
  results.push(gate("grafana_blocked", grafanaOk, "grafana_blocked"));

  const pmRequired = ctx.pmSignoffRequired === true;
  const pmOk = !pmRequired || isSignoffApproved(sidecar?.pmSignoffStatus);
  results.push(gate("pm_signoff_missing", pmOk, "pm_signoff_missing"));

  const opsRequired = ctx.opsSignoffRequired === true;
  const opsOk = !opsRequired || isSignoffApproved(sidecar?.opsSignoffStatus);
  results.push(gate("ops_signoff_missing", opsOk, "ops_signoff_missing"));

  results.push(
    gate("incident_active", ctx.incidentActive !== true, "incident_active"),
  );

  results.push(
    gate(
      "percent_rollout_active",
      ctx.percentRolloutActive !== true,
      "percent_rollout_active",
    ),
  );

  results.push(
    gate(
      "worker_deploy_active",
      ctx.workerDeployActive !== true,
      "worker_deploy_active",
    ),
  );

  const productionWriteBlocked =
    ctx.productionWriteRequested !== true ||
    (ctx.productionWriteRequested === true &&
      isProductionLikeEnvironment(environment) &&
      false);
  results.push(
    gate(
      "production_write_blocked",
      ctx.productionWriteRequested !== true,
      "production_write_blocked",
    ),
  );

  return results;
}

export function assertP76CanonicalApplyPreviewNeverWrites(
  payload: Pick<
    P76CanonicalApplyPreviewPayloadV1,
    "mode" | "safety" | "canApply"
  >,
): void {
  if (payload.mode !== "preview") {
    throw new Error("P7.10-r7d invariant: apply preview mode must be preview");
  }
  const { safety } = payload;
  if (safety.writesDb !== false) {
    throw new Error("P7.10-r7d invariant: preview must not write DB");
  }
  if (safety.writesMatchResult !== false) {
    throw new Error("P7.10-r7d invariant: preview must not write MatchResult");
  }
  if (safety.writesFinalScore !== false) {
    throw new Error("P7.10-r7d invariant: preview must not write finalScore");
  }
  if (safety.triggersWorker !== false) {
    throw new Error("P7.10-r7d invariant: preview must not trigger worker");
  }
  if (safety.changesPercent !== false) {
    throw new Error("P7.10-r7d invariant: preview must not change percent");
  }
  if (safety.productionRollout !== false) {
    throw new Error("P7.10-r7d invariant: preview must not enable production rollout");
  }
}

const PREVIEW_SAFETY = {
  writesDb: false,
  writesMatchResult: false,
  writesFinalScore: false,
  triggersWorker: false,
  changesPercent: false,
  productionRollout: false,
} as const;

export function buildP76CanonicalApplyPreviewPayloadV1(
  input: P76CanonicalApplyPreviewInputV1,
): P76CanonicalApplyPreviewPayloadV1 {
  const gateResults = evaluateP76CanonicalApplyPreviewGates(input);
  const blockedReasons = gateResults
    .filter((g) => !g.pass && g.blockedReason)
    .map((g) => g.blockedReason!);

  const canApply = blockedReasons.length === 0;

  const sidecar = buildSidecarSnapshot(input);
  const currentMatchResult = buildMatchResultSnapshot(input);
  const proposedChange = buildProposedChange(sidecar, currentMatchResult);

  const snapshotAvailable = currentMatchResult != null && currentMatchResult.id.length > 0;
  const rollbackTokenRequired = canApply && snapshotAvailable;
  const rollbackTokenPreview: "redacted" | null =
    rollbackTokenRequired ? "redacted" : null;

  const payload: P76CanonicalApplyPreviewPayloadV1 = {
    schemaVersion: P76_CANONICAL_APPLY_PREVIEW_SCHEMA_VERSION,
    sourceType: P76_CANONICAL_APPLY_PREVIEW_SOURCE_TYPE,
    sourceVersion: P76_CANONICAL_APPLY_PREVIEW_SOURCE_VERSION,
    mode: "preview",
    canApply,
    blockedReasons,
    sidecar,
    currentMatchResult,
    proposedChange,
    gateResults,
    rollbackPreview: {
      snapshotAvailable,
      rollbackTokenRequired,
      rollbackTokenPreview,
    },
    safety: { ...PREVIEW_SAFETY },
    previewedAt: input.previewedAt ?? new Date().toISOString(),
    previewRequestedBy: input.context?.previewRequestedBy?.trim() || null,
  };

  assertP76CanonicalApplyPreviewNeverWrites(payload);
  return payload;
}
