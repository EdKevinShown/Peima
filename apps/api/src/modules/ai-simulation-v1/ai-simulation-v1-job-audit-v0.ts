import {
  ITEM_STATUS,
  JOB_STATUS,
  JOB_AUDIT_V0_BUILDABILITY_DETAIL,
  JOB_AUDIT_V0_DIAGNOSTIC_BUCKET,
  JOB_AUDIT_V0_SCHEMA,
  JOB_AUDIT_V0_SPEC_CLASSIFICATION,
  JOB_AUDIT_V0_SUPPRESSED_REASON,
} from "./ai-simulation-v1.constants";
import type {
  JobAuditV0,
  JobAuditV0BuildabilityDetail,
  JobAuditV0DiagnosticBucket,
  JobAuditV0ItemCounts,
  JobAuditV0SpecClassification,
  JobAuditV0SuppressedReason,
} from "./ai-simulation-v1.types";
import { tryBuildShortlistDecisionV0 } from "./shortlist-decision-v0";
import { tryBuildShortlistFourDimV0 } from "./shortlist-four-dim-v0";
import { tryBuildShortlistScenariosV0 } from "./shortlist-scenarios-v0";

type ItemRow = {
  candidateUserId: string;
  status: string;
  evaluator: unknown;
};

type JobForAudit = {
  jobStatus: string;
  shortlistBinding: unknown;
  shortlistDecisionV0: unknown;
  shortlistFourDimV0?: unknown;
  shortlistScenariosV0?: unknown;
  items: Array<{
    candidateUserId: string;
    status: string;
    evaluator: unknown;
  }>;
};

function isNonNullObject(x: unknown): boolean {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function inspectBinding(binding: unknown): {
  present: boolean;
  shapeValid: boolean;
  specClassification: JobAuditV0SpecClassification;
} {
  if (!isNonNullObject(binding)) {
    return {
      present: false,
      shapeValid: false,
      specClassification: JOB_AUDIT_V0_SPEC_CLASSIFICATION.LEGACY_PRE_SHORTLIST_CONTRACT,
    };
  }
  const o = binding as Record<string, unknown>;
  const ids =
    Array.isArray(o.shortlistCandidateUserIds) && o.shortlistCandidateUserIds.every((x) => typeof x === "string")
      ? o.shortlistCandidateUserIds
      : null;
  const shapeValid =
    typeof o.previewPoolId === "string" &&
    typeof o.shortlistSchemaVersion === "string" &&
    typeof o.shortlistFingerprint === "string" &&
    ids != null &&
    ids.length > 0;
  return {
    present: true,
    shapeValid,
    specClassification: shapeValid
      ? JOB_AUDIT_V0_SPEC_CLASSIFICATION.CURRENT_SHORTLIST_CONTRACT
      : JOB_AUDIT_V0_SPEC_CLASSIFICATION.UNKNOWN,
  };
}

function sidecarTrioPresentInJob(job: JobForAudit): boolean {
  return (
    job.shortlistScenariosV0 != null &&
    job.shortlistFourDimV0 != null &&
    job.shortlistDecisionV0 != null
  );
}

function itemRowsFromJob(job: JobForAudit): ItemRow[] {
  return job.items.map((it) => ({
    candidateUserId: it.candidateUserId,
    status: it.status,
    evaluator: it.evaluator,
  }));
}

function itemCounts(job: JobForAudit): JobAuditV0ItemCounts {
  const items = job.items;
  const total = items.length;
  let queued = 0;
  let running = 0;
  let succeeded = 0;
  let failed = 0;
  for (const it of items) {
    if (it.status === ITEM_STATUS.QUEUED) queued += 1;
    else if (it.status === ITEM_STATUS.RUNNING) running += 1;
    else if (it.status === ITEM_STATUS.SUCCEEDED) succeeded += 1;
    else if (it.status === ITEM_STATUS.FAILED) failed += 1;
  }
  return { total, queued, running, succeeded, failed };
}

function computeRankConsistent(
  fourDim: ReturnType<typeof tryBuildShortlistFourDimV0>,
  decision: ReturnType<typeof tryBuildShortlistDecisionV0>,
): boolean {
  if (fourDim == null || decision == null) return false;
  const a = fourDim.comparison.rankedCandidateUserIds;
  const b = decision.rankedCandidateUserIds;
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

function recomputeTrioAndRank(
  job: JobForAudit,
  itemsPayload: ItemRow[],
): {
  scenarios: ReturnType<typeof tryBuildShortlistScenariosV0>;
  fourDim: ReturnType<typeof tryBuildShortlistFourDimV0>;
  decision: ReturnType<typeof tryBuildShortlistDecisionV0>;
  rankConsistent: boolean;
} {
  const scenarios = tryBuildShortlistScenariosV0(job.shortlistBinding, itemsPayload);
  const fourDim = scenarios != null ? tryBuildShortlistFourDimV0(scenarios) : null;
  const decision = tryBuildShortlistDecisionV0(job.shortlistBinding, itemsPayload);
  const rankConsistent = computeRankConsistent(fourDim, decision);
  return { scenarios, fourDim, decision, rankConsistent };
}

/**
 * Read-time derived only (Phase F v0.1). No DB write; not persisted.
 * Mirrors `runJob` `finally` re: tryBuild* + `rankConsistent`.
 */
export function buildJobAuditV0(job: JobForAudit): JobAuditV0 {
  const binding = inspectBinding(job.shortlistBinding);
  const counts = itemCounts(job);
  const trioInDb = sidecarTrioPresentInJob(job);
  const itemsPayload = itemRowsFromJob(job);
  const { scenarios, fourDim, decision, rankConsistent } = recomputeTrioAndRank(job, itemsPayload);
  const recomputeWouldPersistTrio = scenarios != null && fourDim != null && decision != null && rankConsistent;

  if (job.jobStatus !== JOB_STATUS.COMPLETED) {
    return {
      schemaVersion: JOB_AUDIT_V0_SCHEMA,
      jobStatus: job.jobStatus,
      shortlistBindingPresent: binding.present,
      sidecarTrioPresent: trioInDb,
      itemCounts: counts,
      rankConsistent: null,
      sidecarSuppressedReason: JOB_AUDIT_V0_SUPPRESSED_REASON.JOB_IN_PROGRESS,
      specClassification: binding.specClassification,
      diagnosticBucket: JOB_AUDIT_V0_DIAGNOSTIC_BUCKET.IN_PROGRESS,
      buildabilityDetail: binding.present
        ? binding.shapeValid
          ? JOB_AUDIT_V0_BUILDABILITY_DETAIL.NONE
          : JOB_AUDIT_V0_BUILDABILITY_DETAIL.BINDING_SHAPE_INVALID
        : JOB_AUDIT_V0_BUILDABILITY_DETAIL.BINDING_MISSING,
    };
  }

  const decideBucket = (
    specClassification: JobAuditV0SpecClassification,
    sidecarSuppressedReason: JobAuditV0SuppressedReason,
  ): JobAuditV0DiagnosticBucket => {
    if (specClassification === JOB_AUDIT_V0_SPEC_CLASSIFICATION.LEGACY_PRE_SHORTLIST_CONTRACT) {
      return JOB_AUDIT_V0_DIAGNOSTIC_BUCKET.LEGACY_ACCEPTABLE;
    }
    if (
      specClassification === JOB_AUDIT_V0_SPEC_CLASSIFICATION.CURRENT_SHORTLIST_CONTRACT &&
      sidecarSuppressedReason === JOB_AUDIT_V0_SUPPRESSED_REASON.NONE
    ) {
      return JOB_AUDIT_V0_DIAGNOSTIC_BUCKET.CURRENT_OK;
    }
    return JOB_AUDIT_V0_DIAGNOSTIC_BUCKET.CURRENT_ANOMALY;
  };

  const decideBuildabilityDetail = (
    sidecarSuppressedReason: JobAuditV0SuppressedReason,
  ): JobAuditV0BuildabilityDetail => {
    if (!binding.present) return JOB_AUDIT_V0_BUILDABILITY_DETAIL.BINDING_MISSING;
    if (!binding.shapeValid) return JOB_AUDIT_V0_BUILDABILITY_DETAIL.BINDING_SHAPE_INVALID;
    if (sidecarSuppressedReason === JOB_AUDIT_V0_SUPPRESSED_REASON.NONE) {
      return JOB_AUDIT_V0_BUILDABILITY_DETAIL.NONE;
    }
    if (sidecarSuppressedReason === JOB_AUDIT_V0_SUPPRESSED_REASON.RANK_MISMATCH) {
      return JOB_AUDIT_V0_BUILDABILITY_DETAIL.RANK_MISMATCH;
    }
    if (sidecarSuppressedReason === JOB_AUDIT_V0_SUPPRESSED_REASON.PERSISTED_SIDECARS_STALE) {
      return JOB_AUDIT_V0_BUILDABILITY_DETAIL.PERSISTED_SIDECARS_STALE;
    }
    if (sidecarSuppressedReason === JOB_AUDIT_V0_SUPPRESSED_REASON.PERSISTED_SIDECARS_INCONSISTENT) {
      return JOB_AUDIT_V0_BUILDABILITY_DETAIL.PERSISTED_SIDECARS_INCONSISTENT;
    }
    if (
      sidecarSuppressedReason === JOB_AUDIT_V0_SUPPRESSED_REASON.SCENARIOS_NOT_BUILDABLE ||
      sidecarSuppressedReason === JOB_AUDIT_V0_SUPPRESSED_REASON.FOUR_DIM_NOT_BUILDABLE ||
      sidecarSuppressedReason === JOB_AUDIT_V0_SUPPRESSED_REASON.DECISION_NOT_BUILDABLE
    ) {
      return JOB_AUDIT_V0_BUILDABILITY_DETAIL.ITEMS_INCOMPLETE_OR_FAILED;
    }
    return JOB_AUDIT_V0_BUILDABILITY_DETAIL.UNKNOWN;
  };

  if (trioInDb) {
    if (recomputeWouldPersistTrio) {
      const sidecarSuppressedReason = JOB_AUDIT_V0_SUPPRESSED_REASON.NONE;
      return {
        schemaVersion: JOB_AUDIT_V0_SCHEMA,
        jobStatus: job.jobStatus,
        shortlistBindingPresent: binding.present,
        sidecarTrioPresent: true,
        itemCounts: counts,
        rankConsistent: true,
        sidecarSuppressedReason,
        specClassification: binding.specClassification,
        diagnosticBucket: decideBucket(binding.specClassification, sidecarSuppressedReason),
        buildabilityDetail: decideBuildabilityDetail(sidecarSuppressedReason),
      };
    }
    const sidecarSuppressedReason = JOB_AUDIT_V0_SUPPRESSED_REASON.PERSISTED_SIDECARS_INCONSISTENT;
    return {
      schemaVersion: JOB_AUDIT_V0_SCHEMA,
      jobStatus: job.jobStatus,
      shortlistBindingPresent: binding.present,
      sidecarTrioPresent: true,
      itemCounts: counts,
      rankConsistent,
      sidecarSuppressedReason,
      specClassification: binding.specClassification,
      diagnosticBucket: decideBucket(binding.specClassification, sidecarSuppressedReason),
      buildabilityDetail: decideBuildabilityDetail(sidecarSuppressedReason),
    };
  }

  if (recomputeWouldPersistTrio) {
    const sidecarSuppressedReason = JOB_AUDIT_V0_SUPPRESSED_REASON.PERSISTED_SIDECARS_STALE;
    return {
      schemaVersion: JOB_AUDIT_V0_SCHEMA,
      jobStatus: job.jobStatus,
      shortlistBindingPresent: binding.present,
      sidecarTrioPresent: false,
      itemCounts: counts,
      rankConsistent: true,
      sidecarSuppressedReason,
      specClassification: binding.specClassification,
      diagnosticBucket: decideBucket(binding.specClassification, sidecarSuppressedReason),
      buildabilityDetail: decideBuildabilityDetail(sidecarSuppressedReason),
    };
  }

  let reason: JobAuditV0SuppressedReason = JOB_AUDIT_V0_SUPPRESSED_REASON.UNKNOWN;
  if (scenarios == null) {
    reason = JOB_AUDIT_V0_SUPPRESSED_REASON.SCENARIOS_NOT_BUILDABLE;
  } else if (fourDim == null) {
    reason = JOB_AUDIT_V0_SUPPRESSED_REASON.FOUR_DIM_NOT_BUILDABLE;
  } else if (decision == null) {
    reason = JOB_AUDIT_V0_SUPPRESSED_REASON.DECISION_NOT_BUILDABLE;
  } else if (!rankConsistent) {
    reason = JOB_AUDIT_V0_SUPPRESSED_REASON.RANK_MISMATCH;
  }

  return {
    schemaVersion: JOB_AUDIT_V0_SCHEMA,
    jobStatus: job.jobStatus,
    shortlistBindingPresent: binding.present,
    sidecarTrioPresent: false,
    itemCounts: counts,
    rankConsistent,
    sidecarSuppressedReason: reason,
    specClassification: binding.specClassification,
    diagnosticBucket: decideBucket(binding.specClassification, reason),
    buildabilityDetail: decideBuildabilityDetail(reason),
  };
}
