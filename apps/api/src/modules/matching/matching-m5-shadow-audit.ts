/**
 * M5.2-M4 — read-only aggregation over pre-built `multiSourceFinalDecision` sidecars (admin / CLI).
 * No DB, no env, no viewer GET path. Callers fetch rows and pass JSON-shaped inputs.
 *
 * Semantics: `sources.guardrails.status === "pass"` with `sourceSummary === "no_viewer_safe_caution_signals"`
 * means **viewer_safe_no_caution_signal** only — not a full product guardrail sign-off (see `M5_SHADOW_AUDIT_NOTE_VIEWER_SAFE_PASS`).
 */

export const M5_SHADOW_AUDIT_SCHEMA_VERSION = 1 as const;

export const M5_SHADOW_AUDIT_SOURCE_VERSION = "m5.2-m4-shadow-audit-v1" as const;

/** Stable note for run records / dashboards — do not treat counts as hard safety proof. */
export const M5_SHADOW_AUDIT_NOTE_VIEWER_SAFE_PASS =
  "guardrailPassViewerSafeNoCautionSignalCount reflects M5.1 viewer-safe cautions only (no matchInsights cautions / riskFlags / finalize fallback). " +
  "This is NOT a full guardrail engine pass; do not use it alone to justify M5.3 enabled display.";

export type M5ShadowAuditInputItem = {
  matchResultId?: string;
  userId?: string;
  candidateUserId?: string;
  displayCandidateUserId?: string | null;
  multiSourceFinalDecision: unknown;
};

export type M5ShadowAuditSummary = {
  schemaVersion: typeof M5_SHADOW_AUDIT_SCHEMA_VERSION;
  sourceVersion: typeof M5_SHADOW_AUDIT_SOURCE_VERSION;
  /** ISO-8601 when provided by caller (no `Date.now()` inside the builder). */
  auditRunAt: string | null;
  totalItems: number;
  itemsWithValidSidecar: number;
  itemsSkippedInvalidSidecar: number;
  modeReadonlyCount: number;
  modeShadowCount: number;
  decisionRuleCounts: Record<string, number>;
  shadowReasonCounts: Record<string, number>;
  m5ProposedNonNullCount: number;
  wouldChangeCurrentDisplayTrueCount: number;
  shadowConsensusDecisionRuleCount: number;
  pairwiseSourceAvailableCount: number;
  rrmSimSourceAvailableCount: number;
  /** `sources.guardrails.status === "pass"` AND `sourceSummary === "no_viewer_safe_caution_signals"`. */
  guardrailPassViewerSafeNoCautionSignalCount: number;
  /** Other `pass` rows (unexpected `sourceSummary`; keep for drift detection). */
  guardrailPassOtherCount: number;
  guardrailCautionCount: number;
  guardrailBlockCount: number;
  guardrailNotEvaluatedCount: number;
  /** Human-readable audit notes (includes `M5_SHADOW_AUDIT_NOTE_VIEWER_SAFE_PASS`). */
  notes: string[];
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function isValidSidecarShape(raw: unknown): raw is Record<string, unknown> {
  if (!isRecord(raw)) return false;
  if (raw.schemaVersion !== 1) return false;
  if (raw.mode !== "readonly" && raw.mode !== "shadow") return false;
  if (typeof raw.decisionRule !== "string" || !raw.decisionRule.trim()) return false;
  if (!isRecord(raw.sources)) return false;
  if (!isRecord(raw.shadow)) return false;
  if (!isRecord(raw.sources.guardrails)) return false;
  return true;
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

export type BuildM5ShadowAuditSummaryOptions = {
  auditRunAt?: string | null;
};

/**
 * Aggregates shadow / multi-source sidecar fields only. Invalid `multiSourceFinalDecision` rows are skipped
 * (`itemsSkippedInvalidSidecar` incremented) without throwing.
 */
export function buildM5ShadowAuditSummary(
  items: readonly M5ShadowAuditInputItem[],
  options?: BuildM5ShadowAuditSummaryOptions,
): M5ShadowAuditSummary {
  const decisionRuleCounts: Record<string, number> = {};
  const shadowReasonCounts: Record<string, number> = {};

  let itemsWithValidSidecar = 0;
  let modeReadonlyCount = 0;
  let modeShadowCount = 0;
  let m5ProposedNonNullCount = 0;
  let wouldChangeCurrentDisplayTrueCount = 0;
  let shadowConsensusDecisionRuleCount = 0;
  let pairwiseSourceAvailableCount = 0;
  let rrmSimSourceAvailableCount = 0;
  let guardrailPassViewerSafeNoCautionSignalCount = 0;
  let guardrailPassOtherCount = 0;
  let guardrailCautionCount = 0;
  let guardrailBlockCount = 0;
  let guardrailNotEvaluatedCount = 0;

  for (const item of items) {
    const raw = item.multiSourceFinalDecision;
    if (!isValidSidecarShape(raw)) continue;
    itemsWithValidSidecar += 1;

    if (raw.mode === "shadow") modeShadowCount += 1;
    else modeReadonlyCount += 1;

    const rule = String(raw.decisionRule).trim();
    bump(decisionRuleCounts, rule);
    if (rule === "shadow_pairwise_rrm_consensus") {
      shadowConsensusDecisionRuleCount += 1;
    }

    const proposed = raw.m5ProposedDisplayCandidateUserId;
    if (typeof proposed === "string" && proposed.trim()) {
      m5ProposedNonNullCount += 1;
    }
    if (raw.wouldChangeCurrentDisplay === true) {
      wouldChangeCurrentDisplayTrueCount += 1;
    }

    const sources = raw.sources as Record<string, unknown>;
    const pairwise = sources["pairwise"];
    if (isRecord(pairwise) && pairwise.available === true) {
      pairwiseSourceAvailableCount += 1;
    }
    const rrmSim = sources["rrmSim"];
    if (isRecord(rrmSim) && rrmSim.available === true) {
      rrmSimSourceAvailableCount += 1;
    }

    const gr = sources["guardrails"] as Record<string, unknown>;
    const gStatus = gr.status;
    const gSummary = typeof gr.sourceSummary === "string" ? gr.sourceSummary : "";
    if (gStatus === "pass") {
      if (gSummary === "no_viewer_safe_caution_signals") {
        guardrailPassViewerSafeNoCautionSignalCount += 1;
      } else {
        guardrailPassOtherCount += 1;
      }
    } else if (gStatus === "caution") {
      guardrailCautionCount += 1;
    } else if (gStatus === "block") {
      guardrailBlockCount += 1;
    } else if (gStatus === "not_evaluated") {
      guardrailNotEvaluatedCount += 1;
    }

    const shadow = raw.shadow as Record<string, unknown>;
    const sr = shadow["reason"];
    if (typeof sr === "string" && sr.trim()) {
      bump(shadowReasonCounts, sr.trim());
    }
  }

  const totalItems = items.length;
  const notes = [M5_SHADOW_AUDIT_NOTE_VIEWER_SAFE_PASS];
  const auditRunAt =
    options?.auditRunAt === undefined
      ? null
      : options.auditRunAt === null || options.auditRunAt === ""
        ? null
        : String(options.auditRunAt).trim().slice(0, 40) || null;

  return {
    schemaVersion: M5_SHADOW_AUDIT_SCHEMA_VERSION,
    sourceVersion: M5_SHADOW_AUDIT_SOURCE_VERSION,
    auditRunAt,
    totalItems,
    itemsWithValidSidecar,
    itemsSkippedInvalidSidecar: totalItems - itemsWithValidSidecar,
    modeReadonlyCount,
    modeShadowCount,
    decisionRuleCounts,
    shadowReasonCounts,
    m5ProposedNonNullCount,
    wouldChangeCurrentDisplayTrueCount,
    shadowConsensusDecisionRuleCount,
    pairwiseSourceAvailableCount,
    rrmSimSourceAvailableCount,
    guardrailPassViewerSafeNoCautionSignalCount,
    guardrailPassOtherCount,
    guardrailCautionCount,
    guardrailBlockCount,
    guardrailNotEvaluatedCount,
    notes,
  };
}
