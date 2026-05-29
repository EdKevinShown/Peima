/**
 * M1.3-M0 — pure aggregation helpers (no I/O, no Prisma, no LLM).
 * Consumed by tools/m13-m0-calibration-simulator.mjs and by tests.
 */

export const PRODUCTION_TOO_NARROW_LT = 8;
export const REVIEW_MANUALLY_MIN_SPREAD = 8;

/**
 * @param {object} input
 * @param {number} input.spread max-min over non-fallback simulatedRhythmScore
 * @param {number} input.tooNarrowSpreadLt too_narrow iff rrmAvailableCount>=3 && spread < this (default 8)
 * @param {number} input.rrmAvailableCount
 * @param {number} input.fallbackCount
 * @param {number} input.totalItemCount for fallback ratio (>=1)
 * @returns {"ok" | "too_narrow" | "too_many_fallbacks"}
 */
export function classifyScoreDistribution(input) {
  const spread = Number(input.spread ?? 0);
  const tooNarrowSpreadLt =
    input.tooNarrowSpreadLt == null || !Number.isFinite(input.tooNarrowSpreadLt)
      ? PRODUCTION_TOO_NARROW_LT
      : input.tooNarrowSpreadLt;
  const rrmAvailableCount = Math.max(0, Math.trunc(Number(input.rrmAvailableCount ?? 0)));
  const fallbackCount = Math.max(0, Math.trunc(Number(input.fallbackCount ?? 0)));
  const totalItemCount = Math.max(1, Math.trunc(Number(input.totalItemCount ?? 1)));
  const ratioFallback = fallbackCount / totalItemCount;

  if (ratioFallback >= 0.5) return "too_many_fallbacks";
  if (rrmAvailableCount >= 3 && spread < tooNarrowSpreadLt) return "too_narrow";
  return "ok";
}

/**
 * Shorthand: stable cohort (>=3 non-fallback, no fallback ratio issue).
 * @param {number} spread
 * @param {number} tooNarrowSpreadLt
 */
export function classifyScoreDistributionForStableCohort(spread, tooNarrowSpreadLt) {
  return classifyScoreDistribution({
    spread,
    tooNarrowSpreadLt,
    rrmAvailableCount: 4,
    fallbackCount: 0,
    totalItemCount: 4,
  });
}

/**
 * Mirrors read-only M4.0 deriveRecommendation (buildRrmRankingProposal).
 * @param {object} p
 * @param {"ok"|"too_narrow"|"too_many_fallbacks"} p.scoreDistributionFlag
 * @param {boolean} p.topChanged topCandidateChangedIfRrmOnly
 * @param {number} p.spread
 * @param {string|null} p.existingTop
 * @param {string|null} p.rrmTop
 * @param {number} [p.reviewManuallyMinSpread=8]
 */
export function buildProposalRecommendation(p) {
  const spread = Number(p.spread ?? 0);
  const topChanged = p.topChanged === true;
  const flag = p.scoreDistributionFlag;
  const reviewMin =
    p.reviewManuallyMinSpread == null || !Number.isFinite(p.reviewManuallyMinSpread)
      ? REVIEW_MANUALLY_MIN_SPREAD
      : p.reviewManuallyMinSpread;

  if (flag === "too_many_fallbacks") {
    return { recommendation: "do_not_use_for_ranking", confidenceLevel: "low" };
  }
  if (flag === "too_narrow") {
    return { recommendation: "insufficient_separation", confidenceLevel: "low" };
  }

  if (topChanged && spread >= reviewMin) {
    return { recommendation: "review_manually", confidenceLevel: "medium" };
  }

  const existingTop = p.existingTop ?? null;
  const rrmTop = p.rrmTop ?? null;
  if (!topChanged && existingTop != null && rrmTop != null && existingTop === rrmTop) {
    return { recommendation: "supports_existing_rank", confidenceLevel: "high" };
  }

  return { recommendation: "diagnostic_only", confidenceLevel: "medium" };
}

/**
 * Centered rhythm expansion proxy (not RFI-level mapping).
 * @param {number} score
 * @param {number} [factor=1.5]
 */
export function expandRhythmScore(score, factor = 1.5) {
  const s = Number(score);
  const f = Number(factor);
  if (!Number.isFinite(s) || !Number.isFinite(f)) return 0;
  return Math.round(Math.min(100, Math.max(0, 50 + (s - 50) * f)));
}

export function mean(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function emptyPerConfigSummary() {
  return {
    scoreFlagDistribution: { ok: 0, too_narrow: 0, too_many_fallbacks: 0 },
    recommendationDistribution: {
      do_not_use_for_ranking: 0,
      insufficient_separation: 0,
      review_manually: 0,
      supports_existing_rank: 0,
      diagnostic_only: 0,
    },
    avgSpread: 0,
    medianSpread: 0,
    changedTopRate: 0,
    okCount: 0,
    tooNarrowCount: 0,
    insufficientSeparationCount: 0,
  };
}

/**
 * Roll up per-job rows for one calibration config.
 * @param {Array<{ spread: number, scoreDistributionFlag: string, recommendation: string, rrmTopCandidateUserId: string | null }>} jobRows
 * @param {string} _configId reserved for future branching / logging
 * @param {{ baselineRrmTops?: (string | null)[] }} [options]
 */
export function aggregatePerConfig(jobRows, _configId = "", options = {}) {
  const summary = emptyPerConfigSummary();
  const spreads = [];
  const baseline = options.baselineRrmTops;

  let changedTop = 0;
  for (let i = 0; i < jobRows.length; i += 1) {
    const row = jobRows[i];
    const sp = Number(row.spread ?? 0);
    if (Number.isFinite(sp)) spreads.push(sp);

    const flag = row.scoreDistributionFlag;
    if (flag === "ok" || flag === "too_narrow" || flag === "too_many_fallbacks") {
      summary.scoreFlagDistribution[flag] += 1;
    }
    const rec = row.recommendation;
    if (rec && Object.prototype.hasOwnProperty.call(summary.recommendationDistribution, rec)) {
      summary.recommendationDistribution[rec] += 1;
    }
    if (flag === "ok") summary.okCount += 1;
    if (flag === "too_narrow") summary.tooNarrowCount += 1;
    if (rec === "insufficient_separation") summary.insufficientSeparationCount += 1;

    if (baseline && i < baseline.length && row.rrmTopCandidateUserId !== baseline[i]) {
      changedTop += 1;
    }
  }

  summary.avgSpread = mean(spreads);
  summary.medianSpread = median(spreads);
  summary.changedTopRate = jobRows.length > 0 && baseline && baseline.length === jobRows.length ? changedTop / jobRows.length : 0;

  return summary;
}

/**
 * Spread over a list of non-fallback rhythm scores (same semantics as diagnostic).
 * @param {number[]} scores
 */
export function spreadFromRhythmScores(scores) {
  const nums = scores.filter((n) => typeof n === "number" && Number.isFinite(n));
  if (!nums.length) return { min: 0, max: 0, spread: 0 };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max, spread: max - min };
}
