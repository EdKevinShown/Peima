import { RRM_MATCHING_READONLY_DISPLAY_SOURCE_VERSIONS_SET } from "../rrm-shared";
import type { RrmSimReadonlySummaryPayloadV1 } from "./matching-rrm-sim-readonly-summary";
import type { MatchResultRrmTop2DisplayMetaV1 } from "./rrm-top2-display-meta.types";

export const RRM_TOP2_DISPLAY_NO_OP_REASON_CODES = [
  "env_off",
  "meta_missing",
  "meta_schema_invalid",
  "meta_applied_flags_invalid",
  "top2_count_invalid",
  "top2_duplicate",
  "baseline_mismatch",
  "fingerprint_mismatch",
  "rrm_summary_missing",
  "rrm_summary_schema_invalid",
  "rrm_summary_version_rejected",
  "rrm_winner_not_in_top2",
  "rrm_meta_winner_mismatch",
  "rrm_confidence_low",
  "rrm_confidence_unknown",
  "rrm_fallback_used",
  "guardrails_missing",
  "guardrails_block",
  "guardrails_caution",
  "guardrails_not_evaluated",
  "guardrails_pass_predicate_failed",
  "display_source_type_unknown",
  "proposed_user_not_found",
] as const;

export type RrmTop2DisplayNoOpReasonCode = (typeof RRM_TOP2_DISPLAY_NO_OP_REASON_CODES)[number];

export type ValidateRrmTop2DisplayEligibilityInput = {
  m5RrmTop2Enabled: boolean;
  matchResultCandidateUserId: string;
  top2CandidateUserIds: readonly [string, string];
  top2Fingerprint: string;
  /** Parsed `MatchResultRrmTop2DisplayMeta.meta` JSON; `null` means missing / failed parse. */
  rrmDisplayMeta: MatchResultRrmTop2DisplayMetaV1 | null;
  /** Optional DB column `MatchResultRrmTop2DisplayMeta.top2Fingerprint`; when non-null must match `top2Fingerprint`. */
  rowTop2Fingerprint?: string | null;
  rrmSimReadonlySummary: RrmSimReadonlySummaryPayloadV1 | null;
};

export type RrmTop2DisplayEligibilityResult =
  | { ok: true; noOpReasonCode: null }
  | { ok: false; noOpReasonCode: RrmTop2DisplayNoOpReasonCode };

function normId(s: string): string {
  return s.trim();
}

/**
 * Pure eligibility gate for M5.3 RRM Top2 display (M5.3-C1).
 * No Prisma, no env reads, no evaluator — resolver will call this in M5.3-C2.
 */
export function validateRrmTop2DisplayEligibility(
  input: ValidateRrmTop2DisplayEligibilityInput,
): RrmTop2DisplayEligibilityResult {
  if (!input.m5RrmTop2Enabled) {
    return { ok: false, noOpReasonCode: "env_off" };
  }

  const fp = normId(input.top2Fingerprint);
  if (!fp) {
    return { ok: false, noOpReasonCode: "fingerprint_mismatch" };
  }

  if (input.rowTop2Fingerprint != null && input.rowTop2Fingerprint.trim() !== "" && input.rowTop2Fingerprint.trim() !== fp) {
    return { ok: false, noOpReasonCode: "fingerprint_mismatch" };
  }

  const a = normId(input.top2CandidateUserIds[0]);
  const b = normId(input.top2CandidateUserIds[1]);
  if (!a || !b) {
    return { ok: false, noOpReasonCode: "top2_count_invalid" };
  }
  if (a === b) {
    return { ok: false, noOpReasonCode: "top2_duplicate" };
  }
  const top2Set = new Set<string>([a, b]);

  if (!input.rrmDisplayMeta) {
    return { ok: false, noOpReasonCode: "meta_missing" };
  }

  const meta = input.rrmDisplayMeta;
  if (meta.appliedToFinalScore !== false || meta.appliedToWorkerRanking !== false) {
    return { ok: false, noOpReasonCode: "meta_applied_flags_invalid" };
  }

  if (normId(meta.top2Fingerprint) !== fp) {
    return { ok: false, noOpReasonCode: "fingerprint_mismatch" };
  }

  if (normId(meta.baselineCandidateUserId) !== normId(input.matchResultCandidateUserId)) {
    return { ok: false, noOpReasonCode: "baseline_mismatch" };
  }

  const newDisplay = normId(meta.newDisplayCandidateUserId);
  if (!top2Set.has(newDisplay)) {
    return { ok: false, noOpReasonCode: "rrm_winner_not_in_top2" };
  }

  if (!input.rrmSimReadonlySummary) {
    return { ok: false, noOpReasonCode: "rrm_summary_missing" };
  }

  const sum = input.rrmSimReadonlySummary;
  if (sum.schemaVersion !== 1) {
    return { ok: false, noOpReasonCode: "rrm_summary_schema_invalid" };
  }
  if (!RRM_MATCHING_READONLY_DISPLAY_SOURCE_VERSIONS_SET.has(sum.sourceVersion)) {
    return { ok: false, noOpReasonCode: "rrm_summary_version_rejected" };
  }

  const winner = normId(sum.winnerUserId);
  if (!winner || !top2Set.has(winner)) {
    return { ok: false, noOpReasonCode: "rrm_winner_not_in_top2" };
  }
  if (winner !== newDisplay) {
    return { ok: false, noOpReasonCode: "rrm_meta_winner_mismatch" };
  }

  if (sum.fallbackUsed === true) {
    return { ok: false, noOpReasonCode: "rrm_fallback_used" };
  }
  if (sum.confidenceBucket === "low") {
    return { ok: false, noOpReasonCode: "rrm_confidence_low" };
  }
  if (sum.confidenceBucket === "unknown") {
    return { ok: false, noOpReasonCode: "rrm_confidence_unknown" };
  }

  /** M5.5-M0.2: RRM Top2 eligibility uses explicit `meta.guardrails` only (not matchInsights-derived placeholders). */
  const g = meta.guardrails;
  if (!g) {
    return { ok: false, noOpReasonCode: "guardrails_missing" };
  }
  if (g.status === "block") {
    return { ok: false, noOpReasonCode: "guardrails_block" };
  }
  if (g.status === "caution") {
    return { ok: false, noOpReasonCode: "guardrails_caution" };
  }
  if (g.status === "not_evaluated") {
    return { ok: false, noOpReasonCode: "guardrails_not_evaluated" };
  }
  if (g.status !== "pass") {
    return { ok: false, noOpReasonCode: "guardrails_pass_predicate_failed" };
  }
  if (!Array.isArray(g.blockReasons) || g.blockReasons.length > 0) {
    return { ok: false, noOpReasonCode: "guardrails_pass_predicate_failed" };
  }
  if (!Array.isArray(g.cautionReasons) || g.cautionReasons.length > 0) {
    return { ok: false, noOpReasonCode: "guardrails_caution" };
  }

  return { ok: true, noOpReasonCode: null };
}
