/**
 * P7.5-r5-b: dry-run eligibility for APPLY_TO_POOL (pure; never sets appliedToPool true).
 */

import { previewPoolRowDisplaySourceKey } from "../onboarding-photo-preview-display-image-key";
import {
  candidatePassesOppositeBinaryGate,
  isStrictBinaryPreviewGender,
  normalizeUserGenderForPreview,
} from "../onboarding-preview-gender";
import type { OnboardingVisionApplyEnv } from "./onboarding-vision-apply-env";
import { getStablePercentBucket } from "./onboarding-vision-apply-percent-hash";
import { VISUAL_RANKING_SHADOW_SCHEMA_VERSION } from "./visual-ranking-shadow.types";
import type { VisualRankingShadowV1 } from "./visual-ranking-shadow.types";

export type OnboardingVisionApplyEligibilityReason =
  | "env_disabled"
  | "not_in_allowlist"
  | "percent_not_hit"
  | "shadow_missing"
  | "shadow_invalid"
  | "insufficient_unique_candidates"
  | "insufficient_unique_source_images"
  | "gender_violation_guard"
  | "self_candidate_guard"
  | "candidate_count_not_six"
  | "ok";

export type OnboardingVisionApplyEligibilityDecision =
  | "eligible_dry_run"
  | "not_eligible";

export type OnboardingVisionApplyEligibilityOutcome = {
  eligible: boolean;
  decision: OnboardingVisionApplyEligibilityDecision;
  reason: OnboardingVisionApplyEligibilityReason;
  applySourceVersion: string;
  appliedToPool: false;
};

export type OnboardingVisionApplyPoolGuardRow = {
  candidateUserId: string;
  candidateGenderRaw: string | null;
  firstImageUrl: string | null;
  /** First onboarding image review status (asc `createdAt`); used by r5-c1 writer blocked-review guard. */
  firstImageReviewStatus?: string | null;
};

export type EvaluateOnboardingVisionApplyEligibilityInput = {
  env: OnboardingVisionApplyEnv;
  viewerUserId: string;
  visualRankingShadow: VisualRankingShadowV1 | null;
  poolGuardRows: OnboardingVisionApplyPoolGuardRow[];
  viewerGenderRaw: string | null;
};

function isShadowStructurallyValid(
  shadow: VisualRankingShadowV1 | null,
): shadow is VisualRankingShadowV1 {
  if (shadow === null) return false;
  if (shadow.schemaVersion !== VISUAL_RANKING_SHADOW_SCHEMA_VERSION) return false;
  if (shadow.appliedToPool !== false) return false;
  if (!Array.isArray(shadow.slots) || shadow.slots.length !== 6) return false;
  return true;
}

/**
 * Baseline guards aligned with r4-o2 active pool audit (dedupe, self, binary gate).
 */
export function evaluateApplyPoolBaselineGuards(input: {
  viewerUserId: string;
  viewerGenderRaw: string | null;
  poolGuardRows: OnboardingVisionApplyPoolGuardRow[];
}): OnboardingVisionApplyEligibilityReason | null {
  const { viewerUserId, viewerGenderRaw, poolGuardRows } = input;

  if (poolGuardRows.length !== 6) {
    return "candidate_count_not_six";
  }

  const ids = poolGuardRows.map((r) => r.candidateUserId);
  if (new Set(ids).size !== ids.length) {
    return "insufficient_unique_candidates";
  }

  const sourceKeys = poolGuardRows.map((r) =>
    previewPoolRowDisplaySourceKey({
      id: r.candidateUserId,
      firstImageUrl: r.firstImageUrl,
    }),
  );
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    return "insufficient_unique_source_images";
  }

  for (const row of poolGuardRows) {
    if (row.candidateUserId === viewerUserId) {
      return "self_candidate_guard";
    }
  }

  const vNorm = normalizeUserGenderForPreview(viewerGenderRaw);
  const vBin = isStrictBinaryPreviewGender(vNorm) ? vNorm : null;

  if (vBin === null) {
    return "gender_violation_guard";
  }

  for (const row of poolGuardRows) {
    const cNorm = normalizeUserGenderForPreview(row.candidateGenderRaw);
    if (!isStrictBinaryPreviewGender(cNorm)) {
      return "gender_violation_guard";
    }
    if (!candidatePassesOppositeBinaryGate(vBin, row.candidateGenderRaw)) {
      return "gender_violation_guard";
    }
  }

  return null;
}

/**
 * P7.5-r5-b: eligibility for a hypothetical apply (dry-run only).
 * `appliedToPool` is always false in the return value.
 */
export function evaluateOnboardingVisionApplyEligibility(
  input: EvaluateOnboardingVisionApplyEligibilityInput,
): OnboardingVisionApplyEligibilityOutcome {
  const { env, viewerUserId, visualRankingShadow, poolGuardRows, viewerGenderRaw } =
    input;
  const applySourceVersion = env.applySourceVersion;

  const base = (r: OnboardingVisionApplyEligibilityReason) =>
    ({
      eligible: false,
      decision: "not_eligible" as const,
      reason: r,
      applySourceVersion,
      appliedToPool: false as const,
    }) satisfies OnboardingVisionApplyEligibilityOutcome;

  if (!env.applyToPoolEnabled) {
    return base("env_disabled");
  }

  const guardFail = evaluateApplyPoolBaselineGuards({
    viewerUserId,
    viewerGenderRaw,
    poolGuardRows,
  });
  if (guardFail !== null) {
    return base(guardFail);
  }

  if (visualRankingShadow === null) {
    return base("shadow_missing");
  }

  if (!isShadowStructurallyValid(visualRankingShadow)) {
    return base("shadow_invalid");
  }

  const allow = env.allowlistUserIds;
  if (allow.length > 0) {
    if (!allow.includes(viewerUserId)) {
      return base("not_in_allowlist");
    }
    return {
      eligible: true,
      decision: "eligible_dry_run",
      reason: "ok",
      applySourceVersion,
      appliedToPool: false,
    };
  }

  const bucket = getStablePercentBucket(viewerUserId);
  if (bucket >= env.applyPercent) {
    return base("percent_not_hit");
  }

  return {
    eligible: true,
    decision: "eligible_dry_run",
    reason: "ok",
    applySourceVersion,
    appliedToPool: false,
  };
}

export function eligibilityOutcomeToApplyDryRunSummary(
  outcome: OnboardingVisionApplyEligibilityOutcome,
): {
  evaluated: true;
  eligible: boolean;
  reason: string;
  applySourceVersion: string;
  appliedToPool: false;
} {
  return {
    evaluated: true,
    eligible: outcome.eligible,
    reason: outcome.reason,
    applySourceVersion: outcome.applySourceVersion,
    appliedToPool: false,
  };
}
