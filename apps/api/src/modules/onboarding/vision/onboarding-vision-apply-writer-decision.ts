/**
 * P7.5-r5-c1: allowlist-only APPLY_TO_POOL writer gate (pure; no percent gray).
 */

import {
  evaluateApplyPoolBaselineGuards,
  type OnboardingVisionApplyEligibilityOutcome,
  type OnboardingVisionApplyPoolGuardRow,
} from "./onboarding-vision-apply-eligibility";
import {
  DEFAULT_ONBOARDING_VISION_APPLY_SOURCE_VERSION,
  type OnboardingVisionApplyEnv,
} from "./onboarding-vision-apply-env";
import { BLOCKING_REVIEW_FOR_VISION } from "./visual-ranking-shadow-vision-input";
import { VISUAL_RANKING_SHADOW_SCHEMA_VERSION } from "./visual-ranking-shadow.types";
import type { VisualRankingShadowV1 } from "./visual-ranking-shadow.types";

export type OnboardingVisionApplyWriterReason =
  | "ok"
  | "env_disabled"
  | "allowlist_empty"
  | "not_in_allowlist"
  | "eligibility_not_ok"
  | "shadow_missing"
  | "shadow_invalid"
  | "candidate_count_not_six"
  | "insufficient_unique_candidates"
  | "insufficient_unique_source_images"
  | "gender_violation_guard"
  | "self_candidate_guard"
  | "blocked_review_guard"
  | "invalid_apply_source_version";

export type OnboardingVisionApplyWriterDecision = {
  shouldApply: boolean;
  reason: OnboardingVisionApplyWriterReason;
  applySourceVersion: string;
};

const TIER_BY_RANK = [
  "aesthetic_fit",
  "aesthetic_fit",
  "aesthetic_fit",
  "style_similar",
  "style_similar",
  "reflow",
] as const;

const DISPLAY_BY_RANK = ["clear", "clear", "clear", "blurred", "blurred", "hidden"] as const;

/** r5-c1: pool `sourceVersion` values permitted for real apply. */
export function isAllowedApplyPoolSourceVersion(version: string): boolean {
  const t = version.trim();
  if (t.length === 0) return false;
  if (t === DEFAULT_ONBOARDING_VISION_APPLY_SOURCE_VERSION) return true;
  return /^onboarding-photo-preview-v2-vision(-[a-z0-9][a-z0-9-]*)?$/.test(t);
}

function isShadowValidForWriter(
  shadow: VisualRankingShadowV1 | null,
): shadow is VisualRankingShadowV1 {
  if (shadow === null) return false;
  if (shadow.schemaVersion !== VISUAL_RANKING_SHADOW_SCHEMA_VERSION) return false;
  if (!Array.isArray(shadow.slots) || shadow.slots.length !== 6) return false;
  for (let i = 0; i < 6; i++) {
    const slot = shadow.slots[i]!;
    const expectedTier = TIER_BY_RANK[i];
    if (slot.rankInPool !== i + 1 || slot.tier !== expectedTier) return false;
    if (
      typeof slot.shadowCandidateUserId !== "string" ||
      slot.shadowCandidateUserId.trim() === ""
    ) {
      return false;
    }
    if (typeof slot.shadowScore !== "number" || !Number.isFinite(slot.shadowScore)) {
      return false;
    }
  }
  return true;
}

export function buildShadowApplyPoolGuardRows(
  shadow: VisualRankingShadowV1,
  rowByCandidateId: Map<string, OnboardingVisionApplyPoolGuardRow>,
): OnboardingVisionApplyPoolGuardRow[] {
  return [...shadow.slots]
    .sort((a, b) => a.rankInPool - b.rankInPool)
    .map((slot) => {
      const row = rowByCandidateId.get(slot.shadowCandidateUserId);
      return {
        candidateUserId: slot.shadowCandidateUserId,
        candidateGenderRaw: row?.candidateGenderRaw ?? null,
        firstImageUrl: row?.firstImageUrl ?? null,
        firstImageReviewStatus: row?.firstImageReviewStatus ?? null,
      };
    });
}

function hasBlockedReviewInGuardRows(
  rows: OnboardingVisionApplyPoolGuardRow[],
): boolean {
  for (const row of rows) {
    const status = (row.firstImageReviewStatus ?? "").trim();
    if (BLOCKING_REVIEW_FOR_VISION.has(status)) {
      return true;
    }
  }
  return false;
}

export type EvaluateOnboardingVisionApplyWriterDecisionInput = {
  env: OnboardingVisionApplyEnv;
  viewerUserId: string;
  viewerGenderRaw: string | null;
  eligibility: OnboardingVisionApplyEligibilityOutcome;
  visualRankingShadow: VisualRankingShadowV1 | null;
  /** Lookup for shadow slot candidates (gender / image / review). */
  guardRowByCandidateId: Map<string, OnboardingVisionApplyPoolGuardRow>;
};

/**
 * P7.5-r5-c1: allowlist-only writer gate. Never uses `env.applyPercent`.
 */
export function evaluateOnboardingVisionApplyWriterDecision(
  input: EvaluateOnboardingVisionApplyWriterDecisionInput,
): OnboardingVisionApplyWriterDecision {
  const {
    env,
    viewerUserId,
    viewerGenderRaw,
    eligibility,
    visualRankingShadow,
    guardRowByCandidateId,
  } = input;
  const applySourceVersion = env.applySourceVersion;

  const fail = (
    reason: Exclude<OnboardingVisionApplyWriterReason, "ok">,
  ): OnboardingVisionApplyWriterDecision => ({
    shouldApply: false,
    reason,
    applySourceVersion,
  });

  if (!env.applyToPoolEnabled) {
    return fail("env_disabled");
  }

  if (env.allowlistUserIds.length === 0) {
    return fail("allowlist_empty");
  }

  if (!env.allowlistUserIds.includes(viewerUserId)) {
    return fail("not_in_allowlist");
  }

  if (!isAllowedApplyPoolSourceVersion(applySourceVersion)) {
    return fail("invalid_apply_source_version");
  }

  if (!eligibility.eligible || eligibility.reason !== "ok") {
    return fail("eligibility_not_ok");
  }

  if (visualRankingShadow === null) {
    return fail("shadow_missing");
  }

  if (!isShadowValidForWriter(visualRankingShadow)) {
    return fail("shadow_invalid");
  }

  const shadowGuardRows = buildShadowApplyPoolGuardRows(
    visualRankingShadow,
    guardRowByCandidateId,
  );

  const guardFail = evaluateApplyPoolBaselineGuards({
    viewerUserId,
    viewerGenderRaw,
    poolGuardRows: shadowGuardRows,
  });
  if (guardFail !== null) {
    return fail(
      guardFail as Exclude<OnboardingVisionApplyWriterReason, "ok">,
    );
  }

  if (hasBlockedReviewInGuardRows(shadowGuardRows)) {
    return fail("blocked_review_guard");
  }

  return {
    shouldApply: true,
    reason: "ok",
    applySourceVersion,
  };
}

export type ShadowApplySlotItemDef = {
  rankInPool: number;
  tier: string;
  displayMode: string;
  candidateId: string;
  score: number;
};

/** Map shadow slots to pool item defs; preserves 3+2+1 structure. */
export function shadowSlotsToApplyItemDefs(
  shadow: VisualRankingShadowV1,
): ShadowApplySlotItemDef[] {
  return [...shadow.slots]
    .sort((a, b) => a.rankInPool - b.rankInPool)
    .map((slot, idx) => ({
      rankInPool: slot.rankInPool,
      tier: TIER_BY_RANK[idx]!,
      displayMode: DISPLAY_BY_RANK[idx]!,
      candidateId: slot.shadowCandidateUserId,
      score: slot.shadowScore,
    }));
}

export function buildApplyResultSummary(input: {
  applied: boolean;
  reason: string;
  sourceVersion: string;
}): {
  evaluated: true;
  applied: boolean;
  reason: string;
  sourceVersion: string;
} {
  return {
    evaluated: true,
    applied: input.applied,
    reason: input.reason,
    sourceVersion: input.sourceVersion,
  };
}
