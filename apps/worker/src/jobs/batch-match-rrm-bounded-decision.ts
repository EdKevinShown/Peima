/**
 * M6.3-r3: build `matchInsights.rrmBoundedDecision` dry-run meta (audit only).
 * Never throws. Does not read `scoreShadow` (v1) for pass/fail.
 */

import type {
  MatchInsights,
  MatchInsightsRrmBoundedDecision,
  MatchInsightsRrmBoundedDecisionFallbackReason,
  MatchInsightsRrmDecisionShadow,
} from "@peima/shared/types";

import { readM6RrmBoundedDecisionDryRunEnv } from "./batch-match-rrm-bounded-decision-env.js";

/** Must match `MATCH_INSIGHTS_RRM_BOUNDED_DECISION_SOURCE_VERSION` in `packages/shared/types/match-p1.ts`. */
const MATCH_INSIGHTS_RRM_BOUNDED_DECISION_SOURCE_VERSION =
  "m6.3-rrm-bounded-decision-v1" as const;

const SHADOW_EXPECTED_SOURCE_VERSION = "m6.1-rrm-decision-shadow-v1" as const;
const SCORE_SHADOW_V2_SCORING_VERSION = "m6.0-relationship-profile-score-v2-shadow" as const;

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function userRef(id: string): { kind: "user"; id: string } {
  return { kind: "user", id };
}

function buildInputPresence(insights: MatchInsights): MatchInsightsRrmBoundedDecision["inputPresence"] {
  const v2 = insights.scoreShadowV2;
  return {
    scoreShadowV2: !!(v2 && v2.scoringVersion === SCORE_SHADOW_V2_SCORING_VERSION),
    rrmDecisionShadow: insights.rrmDecisionShadow != null,
    rrmV2Top2Selector: insights.rrmV2Top2Selector != null,
    selectedTop2:
      Array.isArray(insights.rrmV2Top2Selector?.selectedTop2) &&
      (insights.rrmV2Top2Selector?.selectedTop2?.length ?? 0) > 0,
    scoreShadowV1LegacyPresent: insights.scoreShadow != null,
  };
}

function fallbackPayload(
  insights: MatchInsights,
  baselineTrim: string,
  reason: MatchInsightsRrmBoundedDecisionFallbackReason,
): MatchInsightsRrmBoundedDecision {
  const ip = buildInputPresence(insights);
  return {
    schemaVersion: 1,
    sourceType: "rrm_bounded_decision",
    sourceVersion: MATCH_INSIGHTS_RRM_BOUNDED_DECISION_SOURCE_VERSION,
    mode: "dry_run",
    decision: "fallback_baseline",
    baselineRef: baselineTrim ? userRef(baselineTrim) : { kind: "user" },
    decisionSource: "fallback",
    wouldSwitch: false,
    fallbackUsed: true,
    fallbackReason: reason,
    guardrails: { blocked: false, blockReasons: [] },
    inputPresence: ip,
    generatedAt: new Date().toISOString(),
  };
}

function parseShadow(
  insights: MatchInsights,
): { ok: true; shadow: MatchInsightsRrmDecisionShadow } | { ok: false; reason: MatchInsightsRrmBoundedDecisionFallbackReason } {
  const raw = insights.rrmDecisionShadow;
  if (raw == null) return { ok: false, reason: "missing_shadow" };
  if (!isRecord(raw)) return { ok: false, reason: "malformed_shadow" };
  if (raw.schemaVersion !== 1) return { ok: false, reason: "malformed_shadow" };
  if (raw.sourceType !== "rrm_decision_shadow") return { ok: false, reason: "malformed_shadow" };
  if (raw.sourceVersion !== SHADOW_EXPECTED_SOURCE_VERSION) {
    return { ok: false, reason: "source_version_mismatch" };
  }
  if (!isRecord(raw.shadow) || typeof raw.shadow.decision !== "string") {
    return { ok: false, reason: "malformed_shadow" };
  }
  return { ok: true, shadow: raw as MatchInsightsRrmDecisionShadow };
}

function contextHighRisk(sel: NonNullable<MatchInsights["rrmV2Top2Selector"]>): boolean {
  const f = sel.contextFlags;
  if (!f || typeof f !== "object") return false;
  return Boolean(
    f.top2GapLarge === true ||
      f.hasLowBand === true ||
      f.hasStrongConflictBand === true ||
      f.anyBelowSuggestedFloor === true,
  );
}

export type BuildRrmBoundedDecisionDryRunInput = {
  insights: MatchInsights;
  baselineCandidateUserId: string;
};

/**
 * When dry-run flag is off → `null` (caller omits `rrmBoundedDecision`).
 * When flag is on → always returns a payload (including `fallback_baseline` for observability).
 */
export function buildRrmBoundedDecisionDryRunPayload(
  input: BuildRrmBoundedDecisionDryRunInput,
): MatchInsightsRrmBoundedDecision | null {
  try {
    if (!readM6RrmBoundedDecisionDryRunEnv().enabled) return null;

    const baselineTrim = input.baselineCandidateUserId.trim();
    const insights = input.insights;
    const ip = buildInputPresence(insights);

    if (!baselineTrim) {
      return fallbackPayload(insights, "", "missing_candidate_user");
    }

    const parsed = parseShadow(insights);
    if (!parsed.ok) {
      return fallbackPayload(insights, baselineTrim, parsed.reason);
    }

    const sh = parsed.shadow;
    const decision = sh.shadow.decision;

    if (decision === "same_as_baseline") {
      return {
        schemaVersion: 1,
        sourceType: "rrm_bounded_decision",
        sourceVersion: MATCH_INSIGHTS_RRM_BOUNDED_DECISION_SOURCE_VERSION,
        mode: "dry_run",
        decision: "would_use_baseline",
        baselineRef: userRef(baselineTrim),
        decisionSource: "baseline",
        wouldSwitch: false,
        fallbackUsed: false,
        fallbackReason: null,
        guardrails: {
          blocked: Boolean(sh.guardrails?.blocked),
          blockReasons: [...(sh.guardrails?.blockReasons ?? [])],
        },
        inputPresence: ip,
        generatedAt: new Date().toISOString(),
      };
    }

    if (decision === "no_shadow_decision") {
      return fallbackPayload(insights, baselineTrim, "shadow_not_switch");
    }

    if (decision !== "switch_to_top2_candidate") {
      return fallbackPayload(insights, baselineTrim, "malformed_shadow");
    }

    if (!ip.scoreShadowV2) {
      return fallbackPayload(insights, baselineTrim, "missing_score_shadow_v2");
    }

    if (!ip.rrmV2Top2Selector || !ip.selectedTop2) {
      return fallbackPayload(insights, baselineTrim, "missing_selected_top2");
    }

    const sel = insights.rrmV2Top2Selector!;
    if (contextHighRisk(sel)) {
      return fallbackPayload(insights, baselineTrim, "context_flags_high_risk");
    }

    if (sh.guardrails?.blocked === true || (sh.guardrails?.blockReasons?.length ?? 0) > 0) {
      return fallbackPayload(insights, baselineTrim, "guardrail_blocked");
    }

    const brs = sh.guardrails?.blockReasons ?? [];
    if (brs.includes("unexpected_exception")) {
      return fallbackPayload(insights, baselineTrim, "unexpected_exception");
    }
    if (brs.includes("parse_error")) {
      return fallbackPayload(insights, baselineTrim, "malformed_shadow");
    }

    const top2 = sel.selectedTop2;
    const targetId = top2[0]?.candidateUserId?.trim() ?? "";
    if (!targetId) {
      return fallbackPayload(insights, baselineTrim, "missing_selected_top2");
    }

    const inTop2 = top2.some((r) => r.candidateUserId?.trim() === targetId);
    if (!inTop2) {
      return fallbackPayload(insights, baselineTrim, "target_not_in_top2");
    }

    if (targetId === baselineTrim) {
      return fallbackPayload(insights, baselineTrim, "shadow_not_switch");
    }

    return {
      schemaVersion: 1,
      sourceType: "rrm_bounded_decision",
      sourceVersion: MATCH_INSIGHTS_RRM_BOUNDED_DECISION_SOURCE_VERSION,
      mode: "dry_run",
      decision: "would_switch_to_rrm",
      baselineRef: userRef(baselineTrim),
      boundedRef: userRef(targetId),
      decisionSource: "rrm_shadow_bounded",
      wouldSwitch: true,
      fallbackUsed: false,
      fallbackReason: null,
      guardrails: {
        blocked: false,
        blockReasons: [],
      },
      inputPresence: ip,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    const insights = input.insights;
    const baselineTrim = input.baselineCandidateUserId.trim();
    return fallbackPayload(insights, baselineTrim, "unexpected_exception");
  }
}
