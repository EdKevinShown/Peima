/**
 * M6.0-R2B — pure helper: stable V2 Top2 from a pool + risk context for always-on RRM (no RRM call, no DB, no resolver).
 * @see docs/M6/M6.0-r1-rrm-v2-integration-scan-plan.md
 * @see docs/M6/M6.0-r2-v2-top2-selector-helper.md
 */

import { RELATIONSHIP_PROFILE_SCORE_V2_VERSION } from "./relationship-profile-score-v2.js";

const V2_BANDS_ALL = new Set<string>([
  "high",
  "good",
  "medium",
  "low",
  "strong_conflict",
]);

const V2_SOURCES_ALLOWED = new Set(["profile_v2_shadow", "insufficient_profile"]);

export type RrmV2Top2CandidateInput = {
  candidateUserId: string;
  scoreShadowV2?: {
    scoringVersion?: string;
    displayScore100?: number;
    band?: string;
    source?: string;
    coreConflictCount?: number;
    strongConflictCount?: number;
    redFlagConflictCount?: number;
  } | null;
};

/** V2 shadow band enum; validated before appearing on `selectedTop2`. */
export type RrmV2Top2Band = "strong_conflict" | "low" | "medium" | "good" | "high";

export type RrmV2Top2SelectorOptions = {
  /** Hint only: scores below this on either selected row set `anyBelowSuggestedFloor`. Default 65. */
  suggestedFloorDisplayScore100?: number;
  /** Hint only: Top1−Top2 above this sets `top2GapLarge`. Default 12. */
  largeGapThreshold?: number;
};

export type RrmV2Top2SelectorReason =
  | "ok"
  | "not_enough_valid_v2_candidates"
  | "invalid_score_shadow_v2";

export type RrmV2Top2ContextFlags = {
  top2GapLarge: boolean;
  hasLowBand: boolean;
  hasStrongConflictBand: boolean;
  anyBelowSuggestedFloor: boolean;
};

export type RrmV2Top2Thresholds = {
  suggestedFloorDisplayScore100: number;
  largeGapThreshold: number;
};

export type RrmV2Top2SelectedRow = {
  candidateUserId: string;
  displayScore100: number;
  band: RrmV2Top2Band;
};

export type RrmV2Top2SelectorResult = {
  /** True iff two distinct valid V2 rows were selected as Top2 (RRM must arbitrate within this pair). */
  eligible: boolean;
  selectedTop2: RrmV2Top2SelectedRow[];
  top1CandidateUserId: string | null;
  top2CandidateUserId: string | null;
  top2Gap: number | null;
  contextFlags: RrmV2Top2ContextFlags;
  thresholds: RrmV2Top2Thresholds;
  reason: RrmV2Top2SelectorReason;
};

const DEFAULT_SUGGESTED_FLOOR = 65;
const DEFAULT_LARGE_GAP = 12;

type ParsedRow = {
  candidateUserId: string;
  displayScore100: number;
  band: RrmV2Top2Band;
};

function normId(id: string): string {
  return String(id ?? "").trim();
}

function parseValidScoreShadowV2(row: RrmV2Top2CandidateInput): ParsedRow | null {
  const id = normId(row.candidateUserId);
  if (!id) return null;

  const s = row.scoreShadowV2;
  if (s == null || typeof s !== "object" || Array.isArray(s)) return null;

  if (s.scoringVersion !== RELATIONSHIP_PROFILE_SCORE_V2_VERSION) return null;
  if (typeof s.source !== "string" || !V2_SOURCES_ALLOWED.has(s.source)) {
    return null;
  }
  const score = s.displayScore100;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score < 0 || score > 100) return null;

  const bandRaw = typeof s.band === "string" ? s.band.trim() : "";
  if (!V2_BANDS_ALL.has(bandRaw)) return null;

  return {
    candidateUserId: id,
    displayScore100: score,
    band: bandRaw as RrmV2Top2Band,
  };
}

function mergeOptions(options?: RrmV2Top2SelectorOptions): RrmV2Top2Thresholds {
  return {
    suggestedFloorDisplayScore100:
      typeof options?.suggestedFloorDisplayScore100 === "number" &&
      Number.isFinite(options.suggestedFloorDisplayScore100)
        ? options.suggestedFloorDisplayScore100
        : DEFAULT_SUGGESTED_FLOOR,
    largeGapThreshold:
      typeof options?.largeGapThreshold === "number" && Number.isFinite(options.largeGapThreshold)
        ? options.largeGapThreshold
        : DEFAULT_LARGE_GAP,
  };
}

function neutralContextFlags(): RrmV2Top2ContextFlags {
  return {
    top2GapLarge: false,
    hasLowBand: false,
    hasStrongConflictBand: false,
    anyBelowSuggestedFloor: false,
  };
}

function buildContextFlags(
  b0: ParsedRow,
  b1: ParsedRow,
  gap: number,
  thresholds: RrmV2Top2Thresholds,
): RrmV2Top2ContextFlags {
  return {
    top2GapLarge: gap > thresholds.largeGapThreshold,
    hasLowBand: b0.band === "low" || b1.band === "low",
    hasStrongConflictBand: b0.band === "strong_conflict" || b1.band === "strong_conflict",
    anyBelowSuggestedFloor:
      b0.displayScore100 < thresholds.suggestedFloorDisplayScore100 ||
      b1.displayScore100 < thresholds.suggestedFloorDisplayScore100,
  };
}

/**
 * Select the top two valid V2 shadow rows by `displayScore100` (desc, tie-break `candidateUserId`).
 * Does not gate RRM: low band, strong_conflict, wide gap, or low score only influence `contextFlags`.
 */
export function selectV2Top2Candidates(
  candidates: readonly RrmV2Top2CandidateInput[],
  options?: RrmV2Top2SelectorOptions,
): RrmV2Top2SelectorResult {
  const thresholds = mergeOptions(options);

  const ineligibleBase = (): RrmV2Top2SelectorResult => ({
    eligible: false,
    selectedTop2: [],
    top1CandidateUserId: null,
    top2CandidateUserId: null,
    top2Gap: null,
    contextFlags: neutralContextFlags(),
    thresholds,
    reason: "not_enough_valid_v2_candidates",
  });

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return ineligibleBase();
  }

  const parsedStrict: ParsedRow[] = [];
  for (const c of candidates) {
    const p = parseValidScoreShadowV2(c);
    if (p) parsedStrict.push(p);
  }

  if (parsedStrict.length === 0) {
    if (allHadShadowObjectAndInvalid(candidates)) {
      return {
        eligible: false,
        selectedTop2: [],
        top1CandidateUserId: null,
        top2CandidateUserId: null,
        top2Gap: null,
        contextFlags: neutralContextFlags(),
        thresholds,
        reason: "invalid_score_shadow_v2",
      };
    }
    return ineligibleBase();
  }

  /** Dedupe by candidateUserId: keep best (highest displayScore100, then lexicographic id). */
  const bestById = new Map<string, ParsedRow>();
  for (const p of parsedStrict) {
    const prev = bestById.get(p.candidateUserId);
    if (
      !prev ||
      p.displayScore100 > prev.displayScore100 ||
      (p.displayScore100 === prev.displayScore100 && p.candidateUserId < prev.candidateUserId)
    ) {
      bestById.set(p.candidateUserId, p);
    }
  }
  const pool = [...bestById.values()];
  pool.sort((a, b) => {
    if (b.displayScore100 !== a.displayScore100) {
      return b.displayScore100 - a.displayScore100;
    }
    return a.candidateUserId.localeCompare(b.candidateUserId);
  });

  if (pool.length < 2) {
    return ineligibleBase();
  }

  const b0 = pool[0];
  const b1 = pool[1];
  const gap = b0.displayScore100 - b1.displayScore100;
  const contextFlags = buildContextFlags(b0, b1, gap, thresholds);

  return {
    eligible: true,
    selectedTop2: [
      {
        candidateUserId: b0.candidateUserId,
        displayScore100: b0.displayScore100,
        band: b0.band,
      },
      {
        candidateUserId: b1.candidateUserId,
        displayScore100: b1.displayScore100,
        band: b1.band,
      },
    ],
    top1CandidateUserId: b0.candidateUserId,
    top2CandidateUserId: b1.candidateUserId,
    top2Gap: gap,
    contextFlags,
    thresholds,
    reason: "ok",
  };
}

function allHadShadowObjectAndInvalid(candidates: readonly RrmV2Top2CandidateInput[]): boolean {
  if (candidates.length === 0) return false;
  for (const c of candidates) {
    const s = c.scoreShadowV2;
    if (s == null || typeof s !== "object" || Array.isArray(s)) return false;
    if (parseValidScoreShadowV2(c) != null) return false;
  }
  return true;
}
