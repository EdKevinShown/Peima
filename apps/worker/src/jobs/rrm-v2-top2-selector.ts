/**
 * M6.0-R2 — pure helper: pick V2 Top2 subset for future RRM gating (no RRM call, no DB, no resolver).
 * @see docs/M6/M6.0-r1-rrm-v2-integration-scan-plan.md
 * @see docs/M6/M6.0-r2-v2-top2-selector-helper.md
 */

import { RELATIONSHIP_PROFILE_SCORE_V2_VERSION } from "./relationship-profile-score-v2.js";

const V2_BANDS_ALL = new Set([
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

export type RrmV2Top2AllowBand = "medium" | "good" | "high";

export type RrmV2Top2SelectorOptions = {
  minDisplayScore100?: number;
  maxTop2Gap?: number;
  allowBands?: readonly RrmV2Top2AllowBand[];
};

export type RrmV2Top2SelectorReason =
  | "ok"
  | "not_enough_valid_v2_candidates"
  | "top2_below_min_score"
  | "top2_gap_too_large"
  | "invalid_score_shadow_v2";

export type RrmV2Top2SelectedRow = {
  candidateUserId: string;
  displayScore100: number;
  band: string;
};

export type RrmV2Top2SelectorResult = {
  eligible: boolean;
  selectedTop2: RrmV2Top2SelectedRow[];
  top1CandidateUserId: string | null;
  top2CandidateUserId: string | null;
  reason: RrmV2Top2SelectorReason;
  top2Gap: number | null;
};

const DEFAULT_MIN = 65;
const DEFAULT_GAP = 12;
const DEFAULT_ALLOW_BANDS: readonly RrmV2Top2AllowBand[] = ["medium", "good", "high"];

type ParsedRow = {
  candidateUserId: string;
  displayScore100: number;
  band: string;
};

function normId(id: string): string {
  return String(id ?? "").trim();
}

function parseValidScoreShadowV2(
  row: RrmV2Top2CandidateInput,
): ParsedRow | null {
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

  const band = typeof s.band === "string" ? s.band.trim() : "";
  if (!V2_BANDS_ALL.has(band)) return null;

  return { candidateUserId: id, displayScore100: score, band };
}

function mergeOptions(
  options?: RrmV2Top2SelectorOptions,
): Required<RrmV2Top2SelectorOptions> {
  const allowBands =
    options?.allowBands != null && options.allowBands.length > 0
      ? options.allowBands
      : DEFAULT_ALLOW_BANDS;
  return {
    minDisplayScore100:
      typeof options?.minDisplayScore100 === "number" &&
      Number.isFinite(options.minDisplayScore100)
        ? options.minDisplayScore100
        : DEFAULT_MIN,
    maxTop2Gap:
      typeof options?.maxTop2Gap === "number" && Number.isFinite(options.maxTop2Gap)
        ? options.maxTop2Gap
        : DEFAULT_GAP,
    allowBands,
  };
}

/**
 * Decide whether RRM may intervene on a V2-ranked Top2 pair from a preview-pool-sized candidate list.
 * Does not call RRM, does not read DB, does not mutate inputs.
 */
export function selectV2Top2Candidates(
  candidates: readonly RrmV2Top2CandidateInput[],
  options?: RrmV2Top2SelectorOptions,
): RrmV2Top2SelectorResult {
  const opt = mergeOptions(options);
  const allowSet = new Set<string>(opt.allowBands);

  const empty: RrmV2Top2SelectorResult = {
    eligible: false,
    selectedTop2: [],
    top1CandidateUserId: null,
    top2CandidateUserId: null,
    reason: "not_enough_valid_v2_candidates",
    top2Gap: null,
  };

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return empty;
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
        reason: "invalid_score_shadow_v2",
        top2Gap: null,
      };
    }
    return empty;
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
  const deduped = [...bestById.values()];

  const poolBand = deduped.filter((p) => allowSet.has(p.band));
  poolBand.sort((a, b) => {
    if (b.displayScore100 !== a.displayScore100) {
      return b.displayScore100 - a.displayScore100;
    }
    return a.candidateUserId.localeCompare(b.candidateUserId);
  });

  if (poolBand.length < 2) {
    return {
      eligible: false,
      selectedTop2: [],
      top1CandidateUserId: null,
      top2CandidateUserId: null,
      reason: "not_enough_valid_v2_candidates",
      top2Gap: null,
    };
  }

  const b0 = poolBand[0];
  const b1 = poolBand[1];
  const gap = b0.displayScore100 - b1.displayScore100;

  const baseIds = {
    top1CandidateUserId: b0.candidateUserId,
    top2CandidateUserId: b1.candidateUserId,
    top2Gap: gap,
  };

  if (b0.displayScore100 < opt.minDisplayScore100 || b1.displayScore100 < opt.minDisplayScore100) {
    return {
      eligible: false,
      selectedTop2: [],
      ...baseIds,
      reason: "top2_below_min_score",
    };
  }

  if (gap > opt.maxTop2Gap) {
    return {
      eligible: false,
      selectedTop2: [],
      ...baseIds,
      reason: "top2_gap_too_large",
    };
  }

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
    ...baseIds,
    reason: "ok",
  };
}

function allHadShadowObjectAndInvalid(
  candidates: readonly RrmV2Top2CandidateInput[],
): boolean {
  if (candidates.length === 0) return false;
  for (const c of candidates) {
    const s = c.scoreShadowV2;
    if (s == null || typeof s !== "object" || Array.isArray(s)) return false;
    if (parseValidScoreShadowV2(c) != null) return false;
  }
  return true;
}
