/**
 * P7.10-r6 — pure builder for P7.6 canonical writer shadow payload.
 */

import { deriveP76AdminStatuses } from "./p76-admin-allowlist-apply-meta.derive";
import type { P76AllowlistApplyMetaDbRow } from "./p76-admin-allowlist-apply-meta.types";
import {
  deriveP76ReadPathFallbackReason,
} from "./p76-read-path-display-resolver";
import {
  isViewerOnP76ReadPathAllowlist,
  readP76ReadPathEnv,
  type P76ReadPathEnv,
} from "./p76-read-path-env";
import { readP76CanonicalWriterShadowEnv } from "./p76-canonical-writer-shadow-env";
import {
  P76_CANONICAL_WRITER_SHADOW_PIPELINE_VERSION,
  P76_CANONICAL_WRITER_SHADOW_SCHEMA_VERSION,
  P76_CANONICAL_WRITER_SHADOW_SCORE_VERSION,
  P76_CANONICAL_WRITER_SHADOW_SOURCE_TYPE,
  P76_CANONICAL_WRITER_SHADOW_SOURCE_VERSION,
  type P76CanonicalWriterShadowBuildInputV1,
  type P76CanonicalWriterShadowGuardrailReason,
  type P76CanonicalWriterShadowPayloadV1,
  type P76CanonicalWriterShadowProvenanceInputSource,
  type P76CanonicalWriterShadowScoreDeltaBand,
} from "./p76-canonical-writer-shadow.types";

const DECISION_RULE_ELIGIBLE = "allowlist_sidecar_selected_candidate_v1";
const DECISION_RULE_INELIGIBLE = "shadow_ineligible_no_proposal_v1";

function mapReadPathFallbackToGuardrail(
  fallback: string,
): P76CanonicalWriterShadowGuardrailReason {
  if (fallback === "eligible") return "ok";
  if (fallback === "exception") return "exception";
  if (fallback === "env_disabled") return "env_disabled";
  if (fallback === "not_allowlisted") return "not_allowlisted";
  if (fallback === "missing_sidecar") return "missing_sidecar";
  if (fallback === "stale_source_version") return "stale_sidecar";
  if (fallback === "rolled_back") return "rolled_back";
  if (
    fallback === "candidate_unavailable" ||
    fallback === "missing_candidate_id"
  ) {
    return "candidate_missing";
  }
  if (fallback.startsWith("violation_") || fallback.startsWith("main_chain_flag_")) {
    return "violation_row";
  }
  return "violation_row";
}

function scoreDeltaBand(delta: number | null): P76CanonicalWriterShadowScoreDeltaBand {
  if (delta == null || !Number.isFinite(delta)) return "unknown";
  const abs = Math.abs(delta);
  if (abs === 0) return "none";
  if (abs < 0.05) return "small";
  if (abs < 0.15) return "medium";
  return "large";
}

function hasBaseline(
  baseline: P76CanonicalWriterShadowBuildInputV1["baseline"],
): boolean {
  return (
    baseline != null &&
    typeof baseline.candidateUserId === "string" &&
    baseline.candidateUserId.trim().length > 0
  );
}

function toSidecarDbRow(
  sidecar: NonNullable<P76CanonicalWriterShadowBuildInputV1["sidecar"]>,
): P76AllowlistApplyMetaDbRow {
  return {
    id: sidecar.id,
    viewerUserId: sidecar.viewerUserId,
    selectedCandidateId: sidecar.selectedCandidateId,
    sourcePipeline: "p7.6_route_c",
    schemaVersion: "p7.6-allowlist-apply-meta-v1",
    sourceVersion: sidecar.sourceVersion,
    routeCArtifactPath: null,
    stage1SelectedCandidateIds: [sidecar.selectedCandidateId],
    stage2Top2CandidateIds: [sidecar.selectedCandidateId],
    selectedBy20DOnlyCandidateId: sidecar.selectedCandidateId,
    selectedByRrmCandidateId: sidecar.selectedCandidateId,
    finalShadowSelectedCandidateId: sidecar.selectedCandidateId,
    allowlistMatched: sidecar.allowlistMatched,
    pmSignoffStatus: sidecar.pmSignoffStatus,
    opsSignoffStatus: sidecar.opsSignoffStatus,
    applied: sidecar.applied,
    appliedToPool: false,
    appliedToMatchResult: sidecar.appliedToMatchResult,
    appliedToFinalScore: sidecar.appliedToFinalScore,
    appliedToWorkerRanking: sidecar.appliedToWorkerRanking,
    appliedToDisplay: sidecar.appliedToDisplay,
    dryRun: sidecar.dryRun,
    appliedAt: new Date("2026-05-18T00:00:00.000Z"),
    appliedBy: null,
    rolledBack: sidecar.rolledBack,
    rolledBackAt: null,
    rolledBackBy: null,
    rollbackReason: null,
    rollbackToken: null,
    auditNotes: {},
    createdAt: new Date("2026-05-18T00:00:00.000Z"),
    updatedAt: new Date("2026-05-18T00:00:00.000Z"),
  };
}

function evaluateGuardrails(
  input: P76CanonicalWriterShadowBuildInputV1,
  readPathEnv: P76ReadPathEnv,
): { eligible: boolean; reason: P76CanonicalWriterShadowGuardrailReason } {
  if (input.resolverError != null) {
    return { eligible: false, reason: "exception" };
  }
  if (!hasBaseline(input.baseline)) {
    return { eligible: false, reason: "missing_baseline" };
  }
  if (!input.sidecar) {
    return { eligible: false, reason: "missing_sidecar" };
  }

  const row = toSidecarDbRow(input.sidecar);
  const derived = deriveP76AdminStatuses(row, {
    currentSourceVersion: readPathEnv.sourceVersion,
  });
  const candidateFound = input.sidecarCandidateExists !== false;
  const fallback = deriveP76ReadPathFallbackReason({
    env: readPathEnv,
    viewerUserId: input.viewerUserId.trim(),
    row,
    violationStatus: derived.violationStatus,
    sidecarStatus: derived.sidecarStatus,
    candidateFound,
  });

  if (fallback === "eligible") {
    return { eligible: true, reason: "ok" };
  }
  return { eligible: false, reason: mapReadPathFallbackToGuardrail(fallback) };
}

function resolveProvenanceInputSource(
  input: P76CanonicalWriterShadowBuildInputV1,
  eligible: boolean,
  shadowEnvEnabled: boolean,
): P76CanonicalWriterShadowProvenanceInputSource {
  if (!shadowEnvEnabled) return "unavailable";
  if (eligible && input.sidecar) return "p76_allowlist_sidecar";
  const display = input.displayCandidateUserId?.trim();
  if (display) return "p76_read_path_display";
  if (hasBaseline(input.baseline)) return "baseline_match_result";
  return "unavailable";
}

function buildPayloadSkeleton(
  input: P76CanonicalWriterShadowBuildInputV1,
  generatedAt: string,
): Pick<
  P76CanonicalWriterShadowPayloadV1,
  "baseline" | "inputPresence"
> {
  const baseline = input.baseline ?? {
    candidateUserId: null,
    finalScore: null,
    displaySourceType: null,
  };
  return {
    baseline: {
      candidateUserId: baseline.candidateUserId,
      finalScore: baseline.finalScore,
      displaySourceType: baseline.displaySourceType ?? null,
    },
    inputPresence: {
      hasBaselineMatchResult: hasBaseline(input.baseline),
      hasAllowlistSidecar: input.sidecar != null,
      hasDisplayCandidate: Boolean(input.displayCandidateUserId?.trim()),
      hasFinalScore:
        baseline.finalScore != null && Number.isFinite(baseline.finalScore),
    },
  };
}

export function assertCanonicalWriterShadowNeverWritesMatchResult(
  payload: Pick<P76CanonicalWriterShadowPayloadV1, "appliedToMatchResult" | "mode">,
): void {
  if (payload.appliedToMatchResult !== false) {
    throw new Error(
      "P7.10-r6 invariant: canonical writer shadow must not set appliedToMatchResult=true",
    );
  }
  if (payload.mode !== "shadow") {
    throw new Error("P7.10-r6 invariant: canonical writer shadow mode must be shadow");
  }
}

export function buildP76CanonicalWriterShadowPayloadV1(
  input: P76CanonicalWriterShadowBuildInputV1,
  opts?: {
    env?: NodeJS.ProcessEnv;
    readPathEnv?: P76ReadPathEnv;
  },
): P76CanonicalWriterShadowPayloadV1 {
  const shadowEnv = readP76CanonicalWriterShadowEnv(opts?.env);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const readPathEnv = opts?.readPathEnv ?? readP76ReadPathEnv(opts?.env);
  const skeleton = buildPayloadSkeleton(input, generatedAt);

  if (!shadowEnv.enabled) {
    const payload: P76CanonicalWriterShadowPayloadV1 = {
      schemaVersion: P76_CANONICAL_WRITER_SHADOW_SCHEMA_VERSION,
      sourceType: P76_CANONICAL_WRITER_SHADOW_SOURCE_TYPE,
      sourceVersion: P76_CANONICAL_WRITER_SHADOW_SOURCE_VERSION,
      pipelineVersion: P76_CANONICAL_WRITER_SHADOW_PIPELINE_VERSION,
      generatedAt,
      mode: "shadow",
      appliedToMatchResult: false,
      ...skeleton,
      proposal: {
        selectedCandidateUserId: null,
        score: null,
        scoreVersion: P76_CANONICAL_WRITER_SHADOW_SCORE_VERSION,
        decisionRule: DECISION_RULE_INELIGIBLE,
      },
      comparison: {
        wouldChangeCandidate: false,
        scoreDelta: null,
        scoreDeltaBand: "unknown",
      },
      provenance: {
        inputSource: "unavailable",
        allowlistApplyMetaId: input.sidecar?.id ?? null,
        sourceVersion: input.sidecar?.sourceVersion ?? readPathEnv.sourceVersion,
        fallbackPolicy: "safe_fallback_v1",
      },
      guardrails: { eligible: false, reason: "disabled" },
      notes: input.notes,
    };
    assertCanonicalWriterShadowNeverWritesMatchResult(payload);
    return payload;
  }

  const guardrails = evaluateGuardrails(input, readPathEnv);
  const baselineCand = skeleton.baseline.candidateUserId;
  const baselineScore = skeleton.baseline.finalScore;

  let selectedCandidate: string | null = null;
  if (guardrails.eligible && input.sidecar) {
    selectedCandidate = input.sidecar.selectedCandidateId.trim() || null;
  }

  const proposalScore =
    guardrails.eligible && baselineScore != null && Number.isFinite(baselineScore)
      ? baselineScore
      : null;

  const scoreDelta =
    proposalScore != null && baselineScore != null && Number.isFinite(baselineScore)
      ? proposalScore - baselineScore
      : null;

  const wouldChangeCandidate =
    guardrails.eligible &&
    selectedCandidate != null &&
    baselineCand != null &&
    selectedCandidate !== baselineCand;

  const payload: P76CanonicalWriterShadowPayloadV1 = {
    schemaVersion: P76_CANONICAL_WRITER_SHADOW_SCHEMA_VERSION,
    sourceType: P76_CANONICAL_WRITER_SHADOW_SOURCE_TYPE,
    sourceVersion: P76_CANONICAL_WRITER_SHADOW_SOURCE_VERSION,
    pipelineVersion: P76_CANONICAL_WRITER_SHADOW_PIPELINE_VERSION,
    generatedAt,
    mode: "shadow",
    appliedToMatchResult: false,
    ...skeleton,
    proposal: {
      selectedCandidateUserId: selectedCandidate,
      score: proposalScore,
      scoreVersion: P76_CANONICAL_WRITER_SHADOW_SCORE_VERSION,
      decisionRule: guardrails.eligible
        ? DECISION_RULE_ELIGIBLE
        : DECISION_RULE_INELIGIBLE,
    },
    comparison: {
      wouldChangeCandidate,
      scoreDelta,
      scoreDeltaBand: scoreDeltaBand(scoreDelta),
    },
    provenance: {
      inputSource: resolveProvenanceInputSource(
        input,
        guardrails.eligible,
        shadowEnv.enabled,
      ),
      allowlistApplyMetaId: input.sidecar?.id ?? null,
      sourceVersion: input.sidecar?.sourceVersion ?? readPathEnv.sourceVersion,
      fallbackPolicy: "safe_fallback_v1",
    },
    guardrails,
    notes: [
      ...(input.notes ?? []),
      ...(readPathEnv.enabled &&
      isViewerOnP76ReadPathAllowlist(input.viewerUserId, readPathEnv)
        ? []
        : ["read_path_env_disabled_or_viewer_not_on_read_path_allowlist"]),
    ].filter((n, i, arr) => arr.indexOf(n) === i),
  };

  if (payload.notes?.length === 0) {
    delete payload.notes;
  }

  assertCanonicalWriterShadowNeverWritesMatchResult(payload);
  return payload;
}
