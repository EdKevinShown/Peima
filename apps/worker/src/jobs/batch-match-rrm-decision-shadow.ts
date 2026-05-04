/**
 * M6.1-r3: build `matchInsights.rrmDecisionShadow` (observation only).
 * Never throws. Does not read `scoreShadow` (v1) for pass/fail.
 */

import type {
  MatchInsights,
  MatchInsightsRrmDecisionShadow,
  MatchInsightsRrmDecisionShadowBlockReason,
  MatchInsightsRrmV2Top2SelectorShadow,
} from "@peima/shared/types";

const SCORE_SHADOW_V2_SCORING_VERSION = "m6.0-relationship-profile-score-v2-shadow" as const;
const SELECTOR_VERSION = "m6.0-rrm-v2-top2-selector-shadow-v1" as const;
const SHADOW_SOURCE_VERSION = "m6.1-rrm-decision-shadow-v1" as const;

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function ref(kind: "match_result" | "user"): { kind: typeof kind; redacted: true } {
  return { kind, redacted: true };
}

function finalScoreBand(finalScore: number): "low" | "medium" | "high" | "unknown" {
  if (typeof finalScore !== "number" || !Number.isFinite(finalScore)) return "unknown";
  if (finalScore < 0.4) return "low";
  if (finalScore < 0.7) return "medium";
  return "high";
}

function top2GapBand(
  top2Gap: number | null | undefined,
  largeThr: number | undefined,
): "small" | "medium" | "large" | "unknown" {
  if (top2Gap == null || typeof top2Gap !== "number" || !Number.isFinite(top2Gap)) return "unknown";
  const thr = typeof largeThr === "number" && largeThr > 0 ? largeThr : 15;
  if (top2Gap <= thr * 0.5) return "small";
  if (top2Gap <= thr) return "medium";
  return "large";
}

function guardrailFlagsFromBlockReasons(
  reasons: readonly MatchInsightsRrmDecisionShadowBlockReason[],
): MatchInsightsRrmDecisionShadow["guardrails"] {
  const s = new Set(reasons);
  return {
    blocked: reasons.length > 0,
    blockReasons: [...reasons],
    blockedByLowBand: s.has("has_low_band"),
    blockedByStrongConflict: s.has("has_strong_conflict_band"),
    blockedByMissingProfile: s.has("missing_candidate_profile"),
    blockedByInvalidSelector:
      s.has("invalid_selector_payload") ||
      s.has("empty_selected_top2") ||
      s.has("missing_rrm_v2_top2_selector") ||
      s.has("parse_error"),
    blockedByBelowSuggestedFloor: s.has("any_below_suggested_floor"),
    blockedByParseError: s.has("parse_error") || s.has("unexpected_exception"),
  };
}

function noShadowPayload(
  inputPresence: MatchInsightsRrmDecisionShadow["inputPresence"],
  blockReasons: MatchInsightsRrmDecisionShadowBlockReason[],
  reasonCode: string,
  finalScore: number,
): MatchInsightsRrmDecisionShadow {
  const g = guardrailFlagsFromBlockReasons(blockReasons);
  return {
    schemaVersion: 1,
    sourceType: "rrm_decision_shadow",
    sourceVersion: SHADOW_SOURCE_VERSION,
    matchResultRef: ref("match_result"),
    baseline: {
      candidateRef: ref("user"),
      source: "worker_current_winner",
      finalScoreBand: finalScoreBand(finalScore),
      rank: 1,
    },
    shadow: {
      candidateRef: ref("user"),
      rankWithinSelectedTop2: 1,
      decision: "no_shadow_decision",
      reasonCode,
      confidenceBand: "low",
    },
    comparison: {
      sameAsBaseline: false,
      switchSuggested: false,
      top2GapBand: "unknown",
      scoreDeltaBand: "unknown",
      riskFlags: [],
    },
    guardrails: g,
    inputPresence,
    generatedAt: new Date().toISOString(),
  };
}

function validateSelectorForShadow(
  sel: MatchInsightsRrmV2Top2SelectorShadow | undefined,
): { ok: true; sel: MatchInsightsRrmV2Top2SelectorShadow } | { ok: false; reasons: MatchInsightsRrmDecisionShadowBlockReason[] } {
  const reasons: MatchInsightsRrmDecisionShadowBlockReason[] = [];
  if (!sel || !isRecord(sel as unknown as Record<string, unknown>)) {
    reasons.push("missing_rrm_v2_top2_selector");
    return { ok: false, reasons };
  }
  if (sel.version !== SELECTOR_VERSION) {
    reasons.push("invalid_selector_payload");
    return { ok: false, reasons };
  }
  if (sel.eligible !== true) reasons.push("eligible_not_true");
  if (sel.reason !== "ok") reasons.push("reason_not_ok");

  const flags = sel.contextFlags;
  if (flags != null && isRecord(flags as unknown as Record<string, unknown>)) {
    if (flags.hasLowBand === true) reasons.push("has_low_band");
    if (flags.hasStrongConflictBand === true) reasons.push("has_strong_conflict_band");
    if (flags.anyBelowSuggestedFloor === true) reasons.push("any_below_suggested_floor");
    if (flags.top2GapLarge === true) reasons.push("top2_gap_large");
  }

  const top2 = sel.selectedTop2;
  if (!Array.isArray(top2)) {
    reasons.push("invalid_selector_payload");
    return { ok: false, reasons };
  }
  if (top2.length === 0) {
    reasons.push("empty_selected_top2");
    return { ok: false, reasons };
  }
  if (top2.length > 2) {
    reasons.push("invalid_selector_payload");
    return { ok: false, reasons };
  }
  for (const row of top2) {
    if (!isRecord(row as unknown as Record<string, unknown>)) {
      reasons.push("parse_error");
      return { ok: false, reasons };
    }
    const id = typeof row.candidateUserId === "string" ? row.candidateUserId.trim() : "";
    if (!id) {
      reasons.push("parse_error");
      return { ok: false, reasons };
    }
  }

  const top1FromRows = typeof top2[0]!.candidateUserId === "string" ? top2[0]!.candidateUserId.trim() : "";
  const top1Field =
    typeof sel.top1CandidateUserId === "string" ? sel.top1CandidateUserId.trim() : "";
  if (top1Field && top1FromRows && top1Field !== top1FromRows) {
    reasons.push("invalid_selector_payload");
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, sel };
}


function reasonCodeFromBlocks(blocks: readonly MatchInsightsRrmDecisionShadowBlockReason[]): string {
  const order: { br: MatchInsightsRrmDecisionShadowBlockReason; code: string }[] = [
    { br: "missing_candidate_user", code: "no_shadow_unknown" },
    { br: "missing_score_shadow_v2", code: "no_shadow_missing_score_shadow_v2" },
    { br: "missing_rrm_v2_top2_selector", code: "no_shadow_missing_selector" },
    { br: "invalid_selector_payload", code: "no_shadow_invalid_selector" },
    { br: "empty_selected_top2", code: "no_shadow_empty_selected_top2" },
    { br: "missing_candidate_profile", code: "no_shadow_missing_candidate_profile" },
    { br: "eligible_not_true", code: "no_shadow_invalid_selector" },
    { br: "reason_not_ok", code: "no_shadow_invalid_selector" },
    { br: "has_low_band", code: "no_shadow_low_band_blocked" },
    { br: "has_strong_conflict_band", code: "no_shadow_strong_conflict_blocked" },
    { br: "any_below_suggested_floor", code: "no_shadow_below_suggested_floor" },
    { br: "top2_gap_large", code: "no_shadow_context_flags_blocked" },
    { br: "parse_error", code: "no_shadow_parse_error" },
    { br: "unexpected_exception", code: "no_shadow_unknown" },
  ];
  const set = new Set(blocks);
  for (const { br, code } of order) {
    if (set.has(br)) return code;
  }
  if (blocks.length > 0) return "no_shadow_context_flags_blocked";
  return "no_shadow_unknown";
}

export type BuildRrmDecisionShadowInput = {
  baselineCandidateUserId: string;
  finalScore: number;
  insights: MatchInsights;
};

/**
 * Build M6.1 shadow payload. Never throws.
 */
export function buildRrmDecisionShadowPayload(input: BuildRrmDecisionShadowInput): MatchInsightsRrmDecisionShadow {
  try {
    const v2 = input.insights.scoreShadowV2;
    const v1Legacy = input.insights.scoreShadow != null;
    const selRaw = input.insights.rrmV2Top2Selector;

    const inputPresence: MatchInsightsRrmDecisionShadow["inputPresence"] = {
      scoreShadowV2: !!(v2 && v2.scoringVersion === SCORE_SHADOW_V2_SCORING_VERSION),
      rrmV2Top2Selector: selRaw != null,
      selectedTop2: Array.isArray(selRaw?.selectedTop2) && selRaw.selectedTop2.length > 0,
      scoreShadowV1LegacyPresent: v1Legacy,
    };

    const baselineTrim = input.baselineCandidateUserId.trim();
    if (!baselineTrim) {
      return noShadowPayload(
        inputPresence,
        ["missing_candidate_user"],
        reasonCodeFromBlocks(["missing_candidate_user"]),
        input.finalScore,
      );
    }

    if (!inputPresence.scoreShadowV2) {
      return noShadowPayload(
        inputPresence,
        ["missing_score_shadow_v2"],
        "no_shadow_missing_score_shadow_v2",
        input.finalScore,
      );
    }

    const validated = validateSelectorForShadow(selRaw);
    if (!validated.ok) {
      return noShadowPayload(
        inputPresence,
        validated.reasons,
        reasonCodeFromBlocks(validated.reasons),
        input.finalScore,
      );
    }

    const sel = validated.sel;
    const top2 = sel.selectedTop2;
    const shadowTop1 = top2[0]!.candidateUserId.trim();
    const gapBand = top2GapBand(sel.top2Gap, sel.thresholds?.largeGapThreshold);
    const same = shadowTop1 === baselineTrim;

    if (same) {
      const lowGapReason =
        sel.top2Gap == null || (typeof sel.top2Gap === "number" && sel.top2Gap <= 0) || gapBand === "small";
      const reasonCode = lowGapReason
        ? "same_as_baseline_low_gap"
        : "same_as_baseline_high_consistency";
      const g = guardrailFlagsFromBlockReasons([]);
      return {
        schemaVersion: 1,
        sourceType: "rrm_decision_shadow",
        sourceVersion: SHADOW_SOURCE_VERSION,
        matchResultRef: ref("match_result"),
        baseline: {
          candidateRef: ref("user"),
          source: "worker_current_winner",
          finalScoreBand: finalScoreBand(input.finalScore),
          rank: 1,
        },
        shadow: {
          candidateRef: ref("user"),
          rankWithinSelectedTop2: 1,
          decision: "same_as_baseline",
          reasonCode,
          confidenceBand: "medium",
        },
        comparison: {
          sameAsBaseline: true,
          switchSuggested: false,
          top2GapBand: gapBand,
          scoreDeltaBand: "unknown",
          riskFlags: [],
        },
        guardrails: g,
        inputPresence,
        generatedAt: new Date().toISOString(),
      };
    }

    const reasonCode = "switch_suggested_stronger_v2_profile_fit";
    const g = guardrailFlagsFromBlockReasons([]);
    return {
      schemaVersion: 1,
      sourceType: "rrm_decision_shadow",
      sourceVersion: SHADOW_SOURCE_VERSION,
      matchResultRef: ref("match_result"),
      baseline: {
        candidateRef: ref("user"),
        source: "worker_current_winner",
        finalScoreBand: finalScoreBand(input.finalScore),
        rank: 1,
      },
      shadow: {
        candidateRef: ref("user"),
        rankWithinSelectedTop2: 1,
        decision: "switch_to_top2_candidate",
        reasonCode,
        confidenceBand: "medium",
      },
      comparison: {
        sameAsBaseline: false,
        switchSuggested: true,
        top2GapBand: gapBand,
        scoreDeltaBand: "unknown",
        riskFlags: [],
      },
      guardrails: g,
      inputPresence,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    const v2 = input.insights.scoreShadowV2;
    const selRaw = input.insights.rrmV2Top2Selector;
    const inputPresence: MatchInsightsRrmDecisionShadow["inputPresence"] = {
      scoreShadowV2: !!(v2 && v2.scoringVersion === SCORE_SHADOW_V2_SCORING_VERSION),
      rrmV2Top2Selector: selRaw != null,
      selectedTop2: Array.isArray(selRaw?.selectedTop2) && selRaw!.selectedTop2.length > 0,
      scoreShadowV1LegacyPresent: input.insights.scoreShadow != null,
    };
    return noShadowPayload(
      inputPresence,
      ["unexpected_exception"],
      "no_shadow_unknown",
      input.finalScore,
    );
  }
}
