import type { MatchResult } from "@peima/database";
import type { MultiSourceGuardrailsSourceReadonly } from "./matching-multi-source-final-decision-m51m0";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

/** Read-only: `matchInsights.explanation.cautions` + `matchInsights.riskFlags` only. */
export function readMatchInsightsCautionSignals(matchInsights: unknown): {
  cautions: string[];
  riskFlags: string[];
} {
  if (!isRecord(matchInsights)) {
    return { cautions: [], riskFlags: [] };
  }
  const cautions: string[] = [];
  const riskFlags: string[] = [];
  const exp = matchInsights.explanation;
  if (isRecord(exp) && Array.isArray(exp.cautions)) {
    for (const x of exp.cautions) {
      if (typeof x === "string" && x.trim()) cautions.push(x.trim());
    }
  }
  if (Array.isArray(matchInsights.riskFlags)) {
    for (const x of matchInsights.riskFlags) {
      if (typeof x === "string" && x.trim()) riskFlags.push(x.trim());
    }
  }
  return { cautions, riskFlags };
}

const M52_SHADOW_TEST_BLOCK_SENTINEL = "peima_m52_shadow_test_block";
const M52_SHADOW_TEST_NOT_EVALUATED_SENTINEL = "peima_m52_shadow_test_not_evaluated";

function isShadowTestBlockRiskFlag(riskFlags: string[]): boolean {
  return riskFlags.some((r) => r === M52_SHADOW_TEST_BLOCK_SENTINEL);
}

/**
 * M5.1 / M5.2 guardrails slice (extracted from `matching-multi-source-final-decision-m51m0` for reuse in M5.3-C2 resolver).
 * `meta` only contributes `fallbackReason` when present (pairwise finalize viewer-safe meta).
 */
export function buildGuardrailsReadonly(
  meta: { fallbackReason: string | null } | null,
  matchRow: MatchResult,
): MultiSourceGuardrailsSourceReadonly {
  const { cautions, riskFlags } = readMatchInsightsCautionSignals(matchRow.matchInsights);
  if (isShadowTestBlockRiskFlag(riskFlags)) {
    return {
      status: "block",
      blockReasons: ["match_insights_risk_flags"],
      cautionReasons: [],
      sourceSummary: "m52_shadow_test_block_sentinel",
    };
  }
  if (riskFlags.some((r) => r === M52_SHADOW_TEST_NOT_EVALUATED_SENTINEL)) {
    return {
      status: "not_evaluated",
      blockReasons: [],
      cautionReasons: [],
      sourceSummary: "m52_shadow_test_not_evaluated_sentinel",
    };
  }
  const cautionReasons: string[] = [];
  for (const c of cautions.slice(0, 8)) {
    cautionReasons.push(c.length > 200 ? `${c.slice(0, 200)}…` : c);
  }
  for (const r of riskFlags.slice(0, 8)) {
    if (r === M52_SHADOW_TEST_BLOCK_SENTINEL || r === M52_SHADOW_TEST_NOT_EVALUATED_SENTINEL) continue;
    cautionReasons.push(r.length > 200 ? `${r.slice(0, 200)}…` : r);
  }
  const fr = meta?.fallbackReason;
  if (typeof fr === "string" && fr.trim()) {
    cautionReasons.push(`finalize_fallback:${fr.trim().slice(0, 120)}`);
  }

  if (cautionReasons.length === 0) {
    return {
      status: "pass",
      blockReasons: [],
      cautionReasons: [],
      sourceSummary: "no_viewer_safe_caution_signals",
    };
  }
  return {
    status: "caution",
    blockReasons: [],
    cautionReasons,
    sourceSummary: "match_insights_or_finalize_fallback_only",
  };
}
