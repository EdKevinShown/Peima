/**
 * Must match `MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION` in `packages/shared/types/match-p1.ts`.
 * Local const avoids `@peima/shared` root (no "." export) and avoids runtime loading `types/index.ts` via Node.
 */
const MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION =
  "m6.0-rrm-v2-top2-selector-shadow-v1" as const;

/** Required for M6 readonly selector display path; v1 shadow is not consulted. */
const SCORE_SHADOW_V2_SCORING_VERSION = "m6.0-relationship-profile-score-v2-shadow" as const;

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function contextFlagsAllSafe(flags: unknown): boolean {
  if (!isRecord(flags)) return false;
  return (
    flags.top2GapLarge !== true &&
    flags.hasLowBand !== true &&
    flags.hasStrongConflictBand !== true &&
    flags.anyBelowSuggestedFloor !== true
  );
}

function scoreShadowV2Present(insights: Record<string, unknown>): boolean {
  const v2 = insights.scoreShadowV2;
  if (!isRecord(v2)) return false;
  return v2.scoringVersion === SCORE_SHADOW_V2_SCORING_VERSION;
}

/**
 * Best-effort parse + eligibility for RRM V2 Top2 selector readonly display (matchInsights only).
 * Never throws. Returns `null` when ineligible or malformed.
 */
export function tryParseRrmV2SelectorReadonlyDisplayFromMatchInsights(
  matchInsights: unknown,
): { displayUserId: string } | null {
  try {
    if (!isRecord(matchInsights)) return null;
    if (!scoreShadowV2Present(matchInsights)) return null;

    const sel = matchInsights.rrmV2Top2Selector;
    if (!isRecord(sel)) return null;

    if (typeof sel.schemaVersion === "number" && sel.schemaVersion !== 1) return null;

    if (sel.version !== MATCH_INSIGHTS_RRM_V2_TOP2_SELECTOR_SHADOW_VERSION) return null;

    if (sel.eligible !== true) return null;
    if (sel.reason !== "ok") return null;

    if (!contextFlagsAllSafe(sel.contextFlags)) return null;

    const top2 = sel.selectedTop2;
    if (!Array.isArray(top2) || top2.length < 1 || top2.length > 2) return null;

    const parsedItems: { candidateUserId: string; rank?: number }[] = [];
    for (const item of top2) {
      if (!isRecord(item)) return null;
      const id = typeof item.candidateUserId === "string" ? item.candidateUserId.trim() : "";
      if (!id) return null;
      const rank = item.rank;
      if (rank !== undefined && (typeof rank !== "number" || !Number.isFinite(rank))) return null;
      parsedItems.push(rank !== undefined ? { candidateUserId: id, rank } : { candidateUserId: id });
    }

    const ranks = parsedItems.map((p) => p.rank).filter((r): r is number => r !== undefined);
    if (ranks.length > 0) {
      if (ranks.length !== parsedItems.length) return null;
      const uniq = new Set(ranks);
      if (uniq.size !== ranks.length) return null;
    }

    const top1FromSelector =
      typeof sel.top1CandidateUserId === "string" ? sel.top1CandidateUserId.trim() : "";
    const firstId = parsedItems[0]!.candidateUserId;
    if (top1FromSelector && firstId !== top1FromSelector) return null;

    return { displayUserId: firstId };
  } catch {
    return null;
  }
}
