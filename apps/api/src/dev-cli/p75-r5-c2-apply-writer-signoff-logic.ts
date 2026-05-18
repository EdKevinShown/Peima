/**
 * P7.5-r5-c2: pure signoff evaluation (testable without DB).
 */

import type { ActivePoolAuditReport } from "../modules/onboarding/onboarding-photo-preview-pool-active-audit";
import { ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION } from "../modules/onboarding/onboarding-photo-preview-pool.service";
import { DEFAULT_ONBOARDING_VISION_APPLY_SOURCE_VERSION } from "../modules/onboarding/vision/onboarding-vision-apply-env";

export const R5_C2_SIGNOFF_SCHEMA_VERSION =
  "p7.5-r5-c2-apply-writer-signoff-v1" as const;

export const R5_C2_V1_SOURCE_VERSION = ONBOARDING_PHOTO_PREVIEW_SOURCE_VERSION;
export const R5_C2_V2_SOURCE_VERSION =
  DEFAULT_ONBOARDING_VISION_APPLY_SOURCE_VERSION;

export type R5C2CaseId = "A" | "B" | "C" | "D" | "E";

export type R5C2CaseSpec = {
  caseId: R5C2CaseId;
  expectedSourceVersion: string;
  expectedApplyResultApplied: boolean;
  expectedReason: string;
  applyToPool: string;
  allowlist?: string;
  allowlistDefined?: boolean;
  percent?: string;
  percentDefined?: boolean;
  applySourceVersion?: string;
  applySourceVersionDefined?: boolean;
};

export function buildR5C2SignoffCases(viewerUserId: string): R5C2CaseSpec[] {
  return [
    {
      caseId: "A",
      expectedSourceVersion: R5_C2_V1_SOURCE_VERSION,
      expectedApplyResultApplied: false,
      expectedReason: "env_disabled",
      applyToPool: "0",
      allowlistDefined: false,
      percent: "0",
    },
    {
      caseId: "B",
      expectedSourceVersion: R5_C2_V1_SOURCE_VERSION,
      expectedApplyResultApplied: false,
      expectedReason: "allowlist_empty",
      applyToPool: "1",
      allowlistDefined: false,
      percent: "100",
    },
    {
      caseId: "C",
      expectedSourceVersion: R5_C2_V1_SOURCE_VERSION,
      expectedApplyResultApplied: false,
      expectedReason: "not_in_allowlist",
      applyToPool: "1",
      allowlist: "some-other-user",
      percent: "0",
    },
    {
      caseId: "D",
      expectedSourceVersion: R5_C2_V2_SOURCE_VERSION,
      expectedApplyResultApplied: true,
      expectedReason: "ok",
      applyToPool: "1",
      allowlist: viewerUserId,
      percent: "0",
      applySourceVersion: R5_C2_V2_SOURCE_VERSION,
    },
    {
      caseId: "E",
      expectedSourceVersion: R5_C2_V1_SOURCE_VERSION,
      expectedApplyResultApplied: false,
      expectedReason: "env_disabled",
      applyToPool: "0",
      allowlistDefined: false,
      percent: "0",
    },
  ];
}

export type R5C2AuditViolationFlags = {
  duplicateCandidateViolation: boolean;
  duplicateSourceImageViolation: boolean;
  genderViolation: boolean;
  selfViolation: boolean;
};

export function auditViolationFlags(
  report: ActivePoolAuditReport,
): R5C2AuditViolationFlags {
  let duplicateCandidateViolation = false;
  let duplicateSourceImageViolation = false;
  let genderViolation = false;
  let selfViolation = false;
  for (const it of report.items) {
    if (it.duplicate_candidate_user_id) duplicateCandidateViolation = true;
    if (it.duplicate_image_source_key) duplicateSourceImageViolation = true;
    if (it.violates_opposite_gender_gate) genderViolation = true;
    if (it.is_viewer_self) selfViolation = true;
  }
  return {
    duplicateCandidateViolation,
    duplicateSourceImageViolation,
    genderViolation,
    selfViolation,
  };
}

export function activeAuditPass(report: ActivePoolAuditReport): boolean {
  if (report.pool_item_count !== 6) return false;
  const v = auditViolationFlags(report);
  return (
    !v.duplicateCandidateViolation &&
    !v.duplicateSourceImageViolation &&
    !v.genderViolation &&
    !v.selfViolation
  );
}

export type R5C2ShadowSummaryRead = {
  applyDryRun?: {
    evaluated?: boolean;
    appliedToPool?: boolean;
  };
  applyResult?: {
    evaluated?: boolean;
    applied?: boolean;
    reason?: string;
    sourceVersion?: string;
  };
};

export type R5C2CaseObserved = {
  actualSourceVersion: string | null;
  actualApplyResultApplied: boolean | null;
  actualReason: string | null;
  applyDryRunAppliedToPool: boolean | null;
  rootAppliedToPool: boolean | null;
  activeAuditPass: boolean;
  poolItemCount: number;
  poolSourceVersionFromAudit: string | null;
  auditFlags: R5C2AuditViolationFlags;
  shadowPresent: boolean;
  poolPresent: boolean;
};

export function evaluateR5C2CasePass(
  spec: R5C2CaseSpec,
  observed: R5C2CaseObserved,
): { pass: boolean; caseError?: string } {
  const bits: string[] = [];

  if (!observed.poolPresent) bits.push("active_pool_missing");
  if (!observed.shadowPresent) bits.push("shadow_payload_missing");
  if (observed.actualSourceVersion !== spec.expectedSourceVersion) {
    bits.push("source_version_mismatch");
  }
  if (observed.actualApplyResultApplied !== spec.expectedApplyResultApplied) {
    bits.push("apply_result_applied_mismatch");
  }
  if (observed.actualReason !== spec.expectedReason) {
    bits.push("apply_result_reason_mismatch");
  }
  if (observed.applyDryRunAppliedToPool !== false) {
    bits.push("apply_dry_run_applied_to_pool_not_false");
  }
  if (observed.rootAppliedToPool !== false) {
    bits.push("root_applied_to_pool_not_false");
  }
  if (!observed.activeAuditPass) bits.push("active_audit_failed");
  if (observed.poolItemCount !== 6) bits.push("pool_item_count_not_six");
  if (
    observed.poolSourceVersionFromAudit !== null &&
    observed.poolSourceVersionFromAudit !== spec.expectedSourceVersion
  ) {
    bits.push("audit_pool_source_version_mismatch");
  }

  if (spec.caseId === "D" && observed.actualSourceVersion === R5_C2_V2_SOURCE_VERSION) {
    /* v2 path — no extra bits */
  }

  const pass = bits.length === 0;
  return pass
    ? { pass: true }
    : { pass: false, caseError: bits.join(";") || "assert_failed" };
}

export function caseSpecToEnvSpec(
  c: R5C2CaseSpec,
): import("./p75-r5-c2-apply-writer-signoff-env").R5C2CaseEnvSpec {
  return {
    applyToPool: c.applyToPool,
    allowlist: c.allowlist,
    allowlistDefined: c.allowlistDefined,
    percent: c.percent,
    percentDefined: c.percentDefined,
    applySourceVersion: c.applySourceVersion,
    applySourceVersionDefined: c.applySourceVersionDefined,
  };
}
